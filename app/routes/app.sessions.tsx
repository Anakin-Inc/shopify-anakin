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
  sessionsList,
} from "../anakin.server";

type Intent = "session_list";

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
    if (intent === "session_list") {
      const domain = String(formData.get("domain") ?? "").trim();
      const result = await sessionsList(apiKey, domain || undefined);
      return { intent, result };
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

export default function Sessions() {
  const { hasApiKey } = useLoaderData<typeof loader>();
  const listFetcher = useFetcher<typeof action>();
  const [domain, setDomain] = useState("");

  const listError =
    listFetcher.data && "error" in listFetcher.data ? listFetcher.data.error : null;
  const listResult =
    listFetcher.data && "result" in listFetcher.data ? listFetcher.data.result : null;
  const isListing = listFetcher.state !== "idle";

  return (
    <s-page heading="Saved browser sessions">
      {!hasApiKey && (
        <s-banner tone="warning" heading="No API key saved yet">
          Save an Anakin API key on the{" "}
          <s-link href="/app">Market research</s-link> page before listing
          sessions.
        </s-banner>
      )}

      <s-section heading="Your saved sessions">
        <s-paragraph>
          Submits <code>GET /sessions</code>. A saved session is an
          encrypted login state (cookies + local storage) for a
          login-protected site — its id can be pasted into the{" "}
          <s-link href="/app/site-explorer">Site explorer</s-link> page&rsquo;s
          Crawl form to fetch pages that require being signed in.
        </s-paragraph>
        <listFetcher.Form method="post">
          <input type="hidden" name="intent" value="session_list" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="domain"
              label="Domain filter (optional)"
              placeholder="amazon.com"
              value={domain}
              onChange={(e) => setDomain(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isListing ? { loading: true } : {})}
            >
              List sessions
            </s-button>
          </s-stack>
        </listFetcher.Form>
        {listError && (
          <s-banner tone="critical" heading="Could not load sessions">
            {listError}
          </s-banner>
        )}
        {listResult !== null && listResult !== undefined && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto" }}>
              <code>{JSON.stringify(listResult, null, 2)}</code>
            </pre>
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="Creating a session">
        <s-paragraph>
          A new session can&rsquo;t be created from this app — it&rsquo;s an
          interactive flow (a live browser you log into yourself, 2FA and
          captchas included) only available from the Anakin dashboard at{" "}
          <s-link href="https://anakin.io/dashboard" target="_blank">
            anakin.io/dashboard
          </s-link>
          . Once created there, it shows up in the list above.
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
