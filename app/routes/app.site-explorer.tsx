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
  mapSite,
  crawlSite,
  type MapResult,
  type CrawlResult,
} from "../anakin.server";

type Intent = "map" | "crawl";

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
    if (intent === "map") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { intent, error: "Enter a URL to map." };
      const limit = Number(formData.get("limit") ?? 100) || 100;
      const depth = Number(formData.get("depth") ?? 2) || 2;
      const includeSubdomains = formData.get("includeSubdomains") === "on";
      const useBrowser = formData.get("useBrowser") === "on";
      const result = await mapSite(apiKey, url, {
        limit,
        depth,
        includeSubdomains,
        useBrowser,
      });
      return { intent, result } satisfies { intent: Intent; result: MapResult };
    }

    if (intent === "crawl") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { intent, error: "Enter a URL to crawl." };
      const maxPages = Number(formData.get("maxPages") ?? 10) || 10;
      const depth = Number(formData.get("depth") ?? 1) || 1;
      const useBrowser = formData.get("useBrowser") === "on";
      const sessionId = String(formData.get("sessionId") ?? "").trim();
      const result = await crawlSite(apiKey, url, {
        maxPages,
        depth,
        useBrowser,
        ...(sessionId ? { sessionId } : {}),
      });
      return { intent, result } satisfies { intent: Intent; result: CrawlResult };
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

export default function SiteExplorer() {
  const { hasApiKey } = useLoaderData<typeof loader>();

  const mapFetcher = useFetcher<typeof action>();
  const crawlFetcher = useFetcher<typeof action>();

  const [mapUrl, setMapUrl] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");

  const mapResult =
    mapFetcher.data && "result" in mapFetcher.data
      ? (mapFetcher.data.result as MapResult)
      : null;
  const mapError =
    mapFetcher.data && "error" in mapFetcher.data ? mapFetcher.data.error : null;

  const crawlResult =
    crawlFetcher.data && "result" in crawlFetcher.data
      ? (crawlFetcher.data.result as CrawlResult)
      : null;
  const crawlError =
    crawlFetcher.data && "error" in crawlFetcher.data ? crawlFetcher.data.error : null;

  const isMapping = mapFetcher.state !== "idle";
  const isCrawling = crawlFetcher.state !== "idle";

  return (
    <s-page heading="Site explorer">
      {!hasApiKey && (
        <s-banner tone="warning" heading="No API key saved yet">
          Save an Anakin API key on the{" "}
          <s-link href="/app">Market research</s-link> page before mapping or
          crawling a site.
        </s-banner>
      )}

      <s-section heading="Map a site's structure">
        <s-paragraph>
          Submits <code>POST /map</code>, then polls <code>GET /map/:jobId</code>
          . Discovers the URLs reachable from a starting page -- useful for
          understanding a competitor&rsquo;s site structure before crawling
          it, or finding the sub-pages worth scraping individually.
        </s-paragraph>
        <mapFetcher.Form method="post">
          <input type="hidden" name="intent" value="map" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="url"
              label="Starting URL"
              placeholder="https://competitor.com"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.currentTarget.value)}
            ></s-text-field>
            <s-stack direction="inline" gap="base">
              <s-number-field
                name="limit"
                label="Max URLs"
                defaultValue="100"
                min={1}
                max={1000}
              ></s-number-field>
              <s-number-field
                name="depth"
                label="Depth"
                defaultValue="2"
                min={1}
                max={5}
              ></s-number-field>
            </s-stack>
            <s-checkbox name="includeSubdomains" label="Include subdomains"></s-checkbox>
            <s-checkbox
              name="useBrowser"
              label="Render with a headless browser (for JS-heavy sites)"
            ></s-checkbox>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isMapping ? { loading: true } : {})}
            >
              Map site
            </s-button>
          </s-stack>
        </mapFetcher.Form>
        {mapError && (
          <s-banner tone="critical" heading="Map failed">
            {mapError}
          </s-banner>
        )}
        {mapResult && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small">
              <s-text>
                {mapResult.totalLinks ?? mapResult.links?.length ?? 0} links found
                {typeof mapResult.totalExternalLinks === "number"
                  ? ` (${mapResult.totalExternalLinks} external)`
                  : ""}
              </s-text>
              {mapResult.links && mapResult.links.length > 0 && (
                <s-table>
                  <s-table-header-row>
                    <s-table-header>URL</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {mapResult.links.slice(0, 50).map((link) => (
                      <s-table-row key={link}>
                        <s-table-cell>
                          <s-link href={link} target="_blank">
                            {link}
                          </s-link>
                        </s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              )}
              {mapResult.links && mapResult.links.length > 50 && (
                <s-text color="subdued">
                  Showing the first 50 of {mapResult.links.length} links.
                </s-text>
              )}
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-section heading="Crawl a site's pages">
        <s-paragraph>
          Submits <code>POST /crawl</code>, then polls{" "}
          <code>GET /crawl/:jobId</code>. Bulk-fetches markdown for up to
          maxPages pages under a starting URL -- useful for pulling a
          competitor&rsquo;s whole catalog or category section at once.
        </s-paragraph>
        <crawlFetcher.Form method="post">
          <input type="hidden" name="intent" value="crawl" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="url"
              label="Starting URL"
              placeholder="https://competitor.com/collections/all"
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.currentTarget.value)}
            ></s-text-field>
            <s-stack direction="inline" gap="base">
              <s-number-field
                name="maxPages"
                label="Max pages"
                defaultValue="10"
                min={1}
                max={500}
              ></s-number-field>
              <s-number-field
                name="depth"
                label="Depth"
                defaultValue="1"
                min={1}
                max={5}
              ></s-number-field>
            </s-stack>
            <s-text-field
              name="sessionId"
              label="Session ID (optional)"
              details="For login-protected sites -- see the Sessions page for saved session IDs."
            ></s-text-field>
            <s-checkbox
              name="useBrowser"
              label="Render with a headless browser (for JS-heavy sites)"
            ></s-checkbox>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isCrawling ? { loading: true } : {})}
            >
              Crawl site
            </s-button>
          </s-stack>
        </crawlFetcher.Form>
        {crawlError && (
          <s-banner tone="critical" heading="Crawl failed">
            {crawlError}
          </s-banner>
        )}
        {crawlResult && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small">
              <s-text>
                {crawlResult.completedPages ?? 0} of {crawlResult.totalPages ?? 0}{" "}
                pages fetched
              </s-text>
              {crawlResult.pages && crawlResult.pages.length > 0 && (
                <s-table>
                  <s-table-header-row>
                    <s-table-header>URL</s-table-header>
                    <s-table-header>Status</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {crawlResult.pages.map((page) => (
                      <s-table-row key={page.url}>
                        <s-table-cell>
                          <s-link href={page.url} target="_blank">
                            {page.url}
                          </s-link>
                        </s-table-cell>
                        <s-table-cell>{page.status}</s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              )}
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="About this page">
        <s-paragraph>
          Both operations poll a background job until it completes, inside
          this page&rsquo;s single request -- large maps or crawls (many
          pages, deep depth) can take a while. See{" "}
          <s-link href="/app">Market research</s-link> to save your Anakin
          API key.
        </s-paragraph>
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
