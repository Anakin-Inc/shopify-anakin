import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { requireShopContext, requireApiKey } from "../anakin-shop.server";
import db from "../db.server";
import {
  AnakinApiError,
  AnakinJobFailedError,
  AnakinJobTimeoutError,
  agenticSearch,
  scrapeUrl,
  search,
  type AgenticSearchResult,
  type ScrapeResult,
  type SearchResult,
} from "../anakin.server";

type Intent = "save_key" | "scrape" | "search" | "agentic_search";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Real Billing API wiring: require an active subscription to this app's
  // one plan before the merchant can use the page. `billing.require` calls
  // the real GraphQL Billing API (`appSubscriptionCreate` under the hood --
  // see SUBMIT.md) via `onFailure`, which redirects to Shopify's own
  // confirmation page. `isTest: true` so this never puts a real charge on a
  // card while the app is unlisted -- flip to conditional-on-env before an
  // App Store submission. Shared with every other /app/* page via
  // requireShopContext -- see app/anakin-shop.server.ts.
  return requireShopContext(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as Intent | null;

  if (intent === "save_key") {
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    if (!apiKey) {
      return { intent, error: "Enter an Anakin API key." };
    }
    await db.shopSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, apiKey },
      update: { apiKey },
    });
    return { intent, ok: true };
  }

  // Every other intent needs a saved key.
  const apiKey = await requireApiKey(request);
  if (!apiKey) {
    return { intent, error: "Save an Anakin API key first." };
  }

  try {
    if (intent === "scrape") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { intent, error: "Enter a URL to scrape." };
      const result = await scrapeUrl(apiKey, url);
      return { intent, result } satisfies {
        intent: Intent;
        result: ScrapeResult;
      };
    }

    if (intent === "search") {
      const prompt = String(formData.get("prompt") ?? "").trim();
      if (!prompt) return { intent, error: "Enter a search prompt." };
      const result = await search(apiKey, prompt);
      return { intent, result } satisfies {
        intent: Intent;
        result: SearchResult;
      };
    }

    if (intent === "agentic_search") {
      const prompt = String(formData.get("prompt") ?? "").trim();
      if (!prompt) return { intent, error: "Enter a research prompt." };
      const result = await agenticSearch(apiKey, prompt);
      return { intent, result } satisfies {
        intent: Intent;
        result: AgenticSearchResult;
      };
    }
  } catch (error) {
    if (
      error instanceof AnakinApiError ||
      error instanceof AnakinJobFailedError ||
      error instanceof AnakinJobTimeoutError
    ) {
      return { intent, error: error.message };
    }
    // Anything else is a bug, not a user-facing API error -- surface it
    // plainly rather than swallowing it, but don't leak a stack trace.
    console.error("Unexpected error calling Anakin API", error);
    return { intent, error: "Something went wrong. Please try again." };
  }

  return { intent, error: "Unknown action." };
};

export default function Index() {
  const { shop, hasApiKey, subscription } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const keyFetcher = useFetcher<typeof action>();
  const scrapeFetcher = useFetcher<typeof action>();
  const searchFetcher = useFetcher<typeof action>();
  const agenticFetcher = useFetcher<typeof action>();

  const [scrapeUrlValue, setScrapeUrlValue] = useState("");
  const [searchPrompt, setSearchPrompt] = useState("");
  const [agenticPrompt, setAgenticPrompt] = useState("");

  useEffect(() => {
    const data = keyFetcher.data;
    if (!data || data.intent !== "save_key") return;
    if ("ok" in data && data.ok) {
      shopify.toast.show("Anakin API key saved");
    } else if ("error" in data && data.error) {
      shopify.toast.show(data.error, { isError: true });
    }
  }, [keyFetcher.data, shopify]);

  const scrapeResult =
    scrapeFetcher.data && "result" in scrapeFetcher.data
      ? (scrapeFetcher.data.result as ScrapeResult)
      : null;
  const scrapeError =
    scrapeFetcher.data && "error" in scrapeFetcher.data
      ? scrapeFetcher.data.error
      : null;

  const searchResult =
    searchFetcher.data && "result" in searchFetcher.data
      ? (searchFetcher.data.result as SearchResult)
      : null;
  const searchError =
    searchFetcher.data && "error" in searchFetcher.data
      ? searchFetcher.data.error
      : null;

  const agenticResult =
    agenticFetcher.data && "result" in agenticFetcher.data
      ? (agenticFetcher.data.result as AgenticSearchResult)
      : null;
  const agenticError =
    agenticFetcher.data && "error" in agenticFetcher.data
      ? agenticFetcher.data.error
      : null;

  const isScraping = scrapeFetcher.state !== "idle";
  const isSearching = searchFetcher.state !== "idle";
  const isResearching = agenticFetcher.state !== "idle";

  return (
    <s-page heading="Anakin market research">
      <s-section heading="Connected">
        <s-paragraph>
          Store: <s-text>{shop}</s-text>
          {subscription ? (
            <>
              {" "}
              · Plan: <s-text>{subscription}</s-text>
            </>
          ) : null}
        </s-paragraph>
      </s-section>

      <s-section heading="Anakin API key">
        <s-paragraph>
          Paste your Anakin API key to enable scraping and search. Get a free
          key with 300 credits, no card required, at{" "}
          <s-link href="https://anakin.io/dashboard" target="_blank">
            anakin.io/dashboard
          </s-link>
          . The key is stored server-side, associated with this store only,
          and never sent to the browser.
        </s-paragraph>
        <keyFetcher.Form method="post">
          <input type="hidden" name="intent" value="save_key" />
          <s-stack direction="inline" gap="base">
            <s-password-field
              name="apiKey"
              label="Anakin API key"
              placeholder={
                hasApiKey
                  ? "•••••••••••••• (saved — enter a new key to replace)"
                  : "ak-..."
              }
              autocomplete="new-password"
            ></s-password-field>
            <s-button
              type="submit"
              {...(keyFetcher.state !== "idle" ? { loading: true } : {})}
            >
              Save key
            </s-button>
          </s-stack>
        </keyFetcher.Form>
        {!hasApiKey && (
          <s-banner tone="warning" heading="No API key saved yet">
            Save a key above before running a scrape or search below.
          </s-banner>
        )}
      </s-section>

      <s-section heading="Scrape a competitor product page">
        <s-paragraph>
          Submits to Anakin&rsquo;s <code>POST /url-scraper</code>, then polls{" "}
          <code>GET /url-scraper/:jobId</code> until the job completes, and
          returns the page as markdown.
        </s-paragraph>
        <scrapeFetcher.Form method="post">
          <input type="hidden" name="intent" value="scrape" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="url"
              label="Product URL"
              placeholder="https://competitor.com/products/example"
              value={scrapeUrlValue}
              onChange={(e) => setScrapeUrlValue(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isScraping ? { loading: true } : {})}
            >
              Scrape
            </s-button>
          </s-stack>
        </scrapeFetcher.Form>
        {scrapeError && (
          <s-banner tone="critical" heading="Scrape failed">
            {scrapeError}
          </s-banner>
        )}
        {scrapeResult && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-text>
                Status: {scrapeResult.status}
                {scrapeResult.cached ? " (cached)" : ""}
              </s-text>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                <code>{scrapeResult.markdown ?? "(no markdown returned)"}</code>
              </pre>
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-section heading="AI search">
        <s-paragraph>
          Synchronous call to <code>POST /search</code> — 3 credits per
          call, no polling.
        </s-paragraph>
        <searchFetcher.Form method="post">
          <input type="hidden" name="intent" value="search" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="prompt"
              label="Search prompt"
              placeholder="Top 5 competitors selling wireless earbuds under $50"
              value={searchPrompt}
              onChange={(e) => setSearchPrompt(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isSearching ? { loading: true } : {})}
            >
              Search
            </s-button>
          </s-stack>
        </searchFetcher.Form>
        {searchError && (
          <s-banner tone="critical" heading="Search failed">
            {searchError}
          </s-banner>
        )}
        {searchResult && (
          <s-table>
            <s-table-header-row>
              <s-table-header>URL</s-table-header>
              <s-table-header>Title</s-table-header>
              <s-table-header>Snippet</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {searchResult.results.map((item) => (
                <s-table-row key={item.url}>
                  <s-table-cell>
                    <s-link href={item.url} target="_blank">
                      {item.url}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{item.title ?? "—"}</s-table-cell>
                  <s-table-cell>{item.snippet ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Agentic research">
        <s-paragraph>
          Multi-stage AI research pipeline — <code>POST /agentic-search</code>
          , then polled. 10 credits. Returns an AI-written summary of the
          research.
        </s-paragraph>
        <agenticFetcher.Form method="post">
          <input type="hidden" name="intent" value="agentic_search" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="prompt"
              label="Research prompt"
              placeholder="How is Acme Corp pricing its flagship product vs. us this quarter?"
              value={agenticPrompt}
              onChange={(e) => setAgenticPrompt(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isResearching ? { loading: true } : {})}
            >
              Research
            </s-button>
          </s-stack>
        </agenticFetcher.Form>
        {agenticError && (
          <s-banner tone="critical" heading="Research failed">
            {agenticError}
          </s-banner>
        )}
        {agenticResult?.generatedJson?.summary && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-paragraph>{agenticResult.generatedJson.summary}</s-paragraph>
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="About this integration">
        <s-paragraph>
          Built on{" "}
          <s-link href="https://anakin.io" target="_blank">
            Anakin
          </s-link>
          &rsquo;s <code>api.anakin.io/v1</code> REST API. See{" "}
          <s-link href="/app/billing">Billing</s-link> for this app&rsquo;s own
          subscription plan.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

// Shopify needs React Router to catch some thrown responses (e.g. the
// redirect billing.require()/billing.request() throw), so that their
// headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
