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
  aiVisibilitySources,
  aiVisibilitySearch,
  type AIVisibilitySourceInfo,
  type AIVisibilitySearchResult,
} from "../anakin.server";

type Intent = "ai_visibility_sources" | "ai_visibility_search";

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
    if (intent === "ai_visibility_sources") {
      const result = await aiVisibilitySources(apiKey);
      return { intent, result } satisfies {
        intent: Intent;
        result: AIVisibilitySourceInfo[];
      };
    }

    if (intent === "ai_visibility_search") {
      const query = String(formData.get("query") ?? "").trim();
      if (!query) return { intent, error: "Enter a question to ask." };
      const sourcesRaw = String(formData.get("sources") ?? "").trim();
      const sources = sourcesRaw
        ? sourcesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const country = String(formData.get("country") ?? "").trim() || undefined;
      const result = await aiVisibilitySearch(apiKey, query, { sources, country });
      return { intent, result } satisfies {
        intent: Intent;
        result: AIVisibilitySearchResult;
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
    console.error("Unexpected error calling Anakin API", error);
    return { intent, error: "Something went wrong. Please try again." };
  }

  return { intent, error: "Unknown action." };
};

export default function AiVisibility() {
  const { hasApiKey } = useLoaderData<typeof loader>();

  const sourcesFetcher = useFetcher<typeof action>();
  const searchFetcher = useFetcher<typeof action>();

  const [query, setQuery] = useState("");
  const [sources, setSources] = useState("");
  const [country, setCountry] = useState("");

  const sourcesResult =
    sourcesFetcher.data && "result" in sourcesFetcher.data
      ? (sourcesFetcher.data.result as AIVisibilitySourceInfo[])
      : null;
  const sourcesError =
    sourcesFetcher.data && "error" in sourcesFetcher.data
      ? sourcesFetcher.data.error
      : null;

  const searchResult =
    searchFetcher.data && "result" in searchFetcher.data
      ? (searchFetcher.data.result as AIVisibilitySearchResult)
      : null;
  const searchError =
    searchFetcher.data && "error" in searchFetcher.data
      ? searchFetcher.data.error
      : null;

  const isLoadingSources = sourcesFetcher.state !== "idle";
  const isSearching = searchFetcher.state !== "idle";

  return (
    <s-page heading="AI visibility">
      {!hasApiKey && (
        <s-banner tone="warning" heading="No API key saved yet">
          Save an Anakin API key on the{" "}
          <s-link href="/app">Market research</s-link> page before checking
          AI visibility.
        </s-banner>
      )}

      <s-section heading="How does AI describe your brand?">
        <s-paragraph>
          Asks the same question to multiple AI answer engines (ChatGPT,
          Gemini, Google AI Overview) and compares what each says — useful
          for checking how AI engines currently describe your store or
          product line, or how they compare you to competitors. Submits{" "}
          <code>POST /ai-visibility/search</code>, then polls to completion.
        </s-paragraph>
        <searchFetcher.Form method="post">
          <input type="hidden" name="intent" value="ai_visibility_search" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="query"
              label="Question"
              placeholder="What is Acme Corp known for selling?"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            ></s-text-field>
            <s-stack direction="inline" gap="base">
              <s-text-field
                name="sources"
                label="Engines (optional, comma-separated slugs)"
                placeholder="chatgpt, gemini"
                value={sources}
                onChange={(e) => setSources(e.currentTarget.value)}
                details="Leave empty to query every enabled engine. See the list below for valid slugs."
              ></s-text-field>
              <s-text-field
                name="country"
                label="Country (optional)"
                placeholder="us"
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
              ></s-text-field>
            </s-stack>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isSearching ? { loading: true } : {})}
            >
              Ask AI engines
            </s-button>
          </s-stack>
        </searchFetcher.Form>
        {searchError && (
          <s-banner tone="critical" heading="Search failed">
            {searchError}
          </s-banner>
        )}
        {searchResult && (
          <s-stack direction="block" gap="base">
            {searchResult.synthesis && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-paragraph>{searchResult.synthesis}</s-paragraph>
              </s-box>
            )}
            {searchResult.results && searchResult.results.length > 0 && (
              <s-table>
                <s-table-header-row>
                  <s-table-header>Engine</s-table-header>
                  <s-table-header>Status</s-table-header>
                  <s-table-header>Summary</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {searchResult.results.map((r, i) => (
                    <s-table-row key={String(r.source ?? i)}>
                      <s-table-cell>{r.source ?? "—"}</s-table-cell>
                      <s-table-cell>{r.status ?? "—"}</s-table-cell>
                      <s-table-cell>{r.summary ?? "—"}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Available AI engines">
        <s-paragraph>
          Submits <code>GET /ai-visibility/sources</code> — the engine slugs
          you can pass above.
        </s-paragraph>
        <sourcesFetcher.Form method="post">
          <input type="hidden" name="intent" value="ai_visibility_sources" />
          <s-button
            type="submit"
            disabled={!hasApiKey}
            {...(isLoadingSources ? { loading: true } : {})}
          >
            Load engines
          </s-button>
        </sourcesFetcher.Form>
        {sourcesError && (
          <s-banner tone="critical" heading="Could not load engines">
            {sourcesError}
          </s-banner>
        )}
        {sourcesResult && sourcesResult.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Slug</s-table-header>
              <s-table-header>Label</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {sourcesResult.map((s) => (
                <s-table-row key={s.slug}>
                  <s-table-cell>{s.slug}</s-table-cell>
                  <s-table-cell>{s.label}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
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
