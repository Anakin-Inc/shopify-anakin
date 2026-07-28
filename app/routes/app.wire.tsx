import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireShopContext, requireApiKey } from "../anakin-shop.server";
import {
  AnakinApiError,
  AnakinJobFailedError,
  AnakinJobTimeoutError,
  wireDiscover,
  wireCatalog,
  wireReadAction,
  type WireResolveResult,
  type WireActionResult,
} from "../anakin.server";

type Intent = "wire_discover" | "wire_catalog" | "wire_read_action";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return requireShopContext(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as Intent | null;

  const apiKey = await requireApiKey(request);
  if (!apiKey) {
    return { intent, error: "Save an Anakin API key on the Market research page first." };
  }

  try {
    if (intent === "wire_discover") {
      const q = String(formData.get("q") ?? "").trim();
      if (!q) return { intent, error: "Describe what you're looking for." };
      const limit = Number(formData.get("limit") ?? 5) || 5;
      const result = await wireDiscover(apiKey, q, limit);
      return { intent, result } satisfies { intent: Intent; result: WireResolveResult };
    }

    if (intent === "wire_catalog") {
      const slug = String(formData.get("slug") ?? "").trim();
      const result = await wireCatalog(apiKey, slug || undefined);
      return { intent, result };
    }

    if (intent === "wire_read_action") {
      const actionId = String(formData.get("actionId") ?? "").trim();
      if (!actionId) return { intent, error: "Enter an action ID (from Discover or Catalog above)." };
      const paramsRaw = String(formData.get("params") ?? "").trim();
      let params: Record<string, unknown> | undefined;
      if (paramsRaw) {
        try {
          params = JSON.parse(paramsRaw) as Record<string, unknown>;
        } catch {
          return { intent, error: "Params must be valid JSON, e.g. {\"query\": \"wireless earbuds\"}." };
        }
      }
      const result = await wireReadAction(apiKey, actionId, params);
      return { intent, result } satisfies { intent: Intent; result: WireActionResult };
    }
  } catch (error) {
    if (
      error instanceof AnakinApiError ||
      error instanceof AnakinJobFailedError ||
      error instanceof AnakinJobTimeoutError
    ) {
      return { intent, error: error.message };
    }
    console.error("Unexpected error calling Anakin API", error);
    return { intent, error: "Something went wrong. Please try again." };
  }

  return { intent, error: "Unknown action." };
};

export default function Wire() {
  const { hasApiKey } = useLoaderData<typeof loader>();

  const discoverFetcher = useFetcher<typeof action>();
  const catalogFetcher = useFetcher<typeof action>();
  const runFetcher = useFetcher<typeof action>();

  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState("");
  const [actionId, setActionId] = useState("");

  const discoverResult =
    discoverFetcher.data && "result" in discoverFetcher.data
      ? (discoverFetcher.data.result as WireResolveResult)
      : null;
  const discoverError =
    discoverFetcher.data && "error" in discoverFetcher.data
      ? discoverFetcher.data.error
      : null;

  const catalogResult =
    catalogFetcher.data && "result" in catalogFetcher.data
      ? catalogFetcher.data.result
      : null;
  const catalogError =
    catalogFetcher.data && "error" in catalogFetcher.data
      ? catalogFetcher.data.error
      : null;

  const runResult =
    runFetcher.data && "result" in runFetcher.data
      ? (runFetcher.data.result as WireActionResult)
      : null;
  const runError =
    runFetcher.data && "error" in runFetcher.data ? runFetcher.data.error : null;

  const isDiscovering = discoverFetcher.state !== "idle";
  const isBrowsingCatalog = catalogFetcher.state !== "idle";
  const isRunning = runFetcher.state !== "idle";

  return (
    <s-page heading="Wire actions">
      {!hasApiKey && (
        <s-banner tone="warning" heading="No API key saved yet">
          Save an Anakin API key on the{" "}
          <s-link href="/app">Market research</s-link> page before using Wire.
        </s-banner>
      )}

      <s-section heading="About Wire">
        <s-paragraph>
          Wire is Anakin&rsquo;s catalog of pre-built actions across hundreds
          of sites (Amazon, Walmart, LinkedIn, and others) for extracting
          data without hand-rolling a scrape -- e.g. a competitor&rsquo;s
          price, specs, or reviews on a specific marketplace. This page only
          covers Wire&rsquo;s read (data-extraction) side: discovering
          actions, browsing the catalog, and running a read action. Wire also
          has write actions (submitting forms, logging in) and a
          build-a-new-action flow -- deliberately out of scope for a
          merchant-facing research app; see SUBMIT.md.
        </s-paragraph>
      </s-section>

      <s-section heading="Find an action">
        <s-paragraph>
          Submits <code>GET /wire/resolve</code> — describe what you want in
          plain language and get back candidate actions with their
          action_id and type (&ldquo;read&rdquo; or &ldquo;write&rdquo;).
        </s-paragraph>
        <discoverFetcher.Form method="post">
          <input type="hidden" name="intent" value="wire_discover" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="q"
              label="What are you looking for?"
              placeholder="top wireless earbuds on walmart"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isDiscovering ? { loading: true } : {})}
            >
              Find actions
            </s-button>
          </s-stack>
        </discoverFetcher.Form>
        {discoverError && (
          <s-banner tone="critical" heading="Discover failed">
            {discoverError}
          </s-banner>
        )}
        {discoverResult?.results && discoverResult.results.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Action ID</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {discoverResult.results.map((candidate, i) => (
                <s-table-row key={String(candidate["action_id"] ?? i)}>
                  <s-table-cell>{String(candidate["action_id"] ?? "—")}</s-table-cell>
                  <s-table-cell>{String(candidate["type"] ?? "—")}</s-table-cell>
                  <s-table-cell>
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>
                      <code>{JSON.stringify(candidate, null, 2)}</code>
                    </pre>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Browse the catalog">
        <s-paragraph>
          Submits <code>GET /wire/catalog</code> (or{" "}
          <code>GET /wire/catalog/:slug</code> with a slug) — leave the slug
          empty to list every supported site, or enter one (e.g.{" "}
          <code>walmart</code>) to see its full action list and parameter
          schemas.
        </s-paragraph>
        <catalogFetcher.Form method="post">
          <input type="hidden" name="intent" value="wire_catalog" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="slug"
              label="Catalog slug (optional)"
              placeholder="walmart"
              value={slug}
              onChange={(e) => setSlug(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isBrowsingCatalog ? { loading: true } : {})}
            >
              Browse catalog
            </s-button>
          </s-stack>
        </catalogFetcher.Form>
        {catalogError && (
          <s-banner tone="critical" heading="Catalog lookup failed">
            {catalogError}
          </s-banner>
        )}
        {catalogResult !== null && catalogResult !== undefined && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto" }}>
              <code>{JSON.stringify(catalogResult, null, 2)}</code>
            </pre>
          </s-box>
        )}
      </s-section>

      <s-section heading="Run a read action">
        <s-paragraph>
          Submits <code>POST /wire/task</code>, then polls the job to
          completion. Paste an action_id found above and, if the action
          takes parameters, a JSON object matching its schema.
        </s-paragraph>
        <runFetcher.Form method="post">
          <input type="hidden" name="intent" value="wire_read_action" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="actionId"
              label="Action ID"
              placeholder="walmart.search_products"
              value={actionId}
              onChange={(e) => setActionId(e.currentTarget.value)}
            ></s-text-field>
            <s-text-area
              name="params"
              label="Params (JSON, optional)"
              placeholder='{"query": "wireless earbuds"}'
              rows={3}
            ></s-text-area>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isRunning ? { loading: true } : {})}
            >
              Run action
            </s-button>
          </s-stack>
        </runFetcher.Form>
        {runError && (
          <s-banner tone="critical" heading="Action failed">
            {runError}
          </s-banner>
        )}
        {runResult?.error && (
          <s-banner tone="warning" heading={`Action error: ${runResult.error.code ?? "unknown"}`}>
            {runResult.error.message ?? "The action could not complete."}
            {runResult.error.connect_url && (
              <>
                {" "}
                <s-link href={runResult.error.connect_url} target="_blank">
                  Connect the account
                </s-link>
              </>
            )}
          </s-banner>
        )}
        {runResult?.data && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small">
              {typeof runResult.credits_used === "number" && (
                <s-text color="subdued">Credits used: {runResult.credits_used}</s-text>
              )}
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto" }}>
                <code>{JSON.stringify(runResult.data, null, 2)}</code>
              </pre>
            </s-stack>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
