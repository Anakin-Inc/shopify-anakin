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
  monitorCreate,
  monitorList,
  monitorChanges,
  monitorControl,
  type MonitorControlAction,
} from "../anakin.server";

type Intent =
  | "monitor_create"
  | "monitor_list"
  | "monitor_changes"
  | "monitor_control";

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
    if (intent === "monitor_create") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { intent, error: "Enter a URL to watch." };
      const intervalMinutes = Number(formData.get("intervalMinutes") ?? 60) || 60;
      if (intervalMinutes < 15) {
        return { intent, error: "Interval must be at least 15 minutes." };
      }
      const watchMode = String(formData.get("watchMode") ?? "full_page") as
        | "full_page"
        | "specific_data";
      const aiMode = formData.get("aiMode") === "on";
      const aiGoal = String(formData.get("aiGoal") ?? "").trim();
      const alertWebhookUrl = String(formData.get("alertWebhookUrl") ?? "").trim();
      const alertEmails = String(formData.get("alertEmails") ?? "").trim();
      const result = await monitorCreate(apiKey, url, intervalMinutes, {
        watchMode,
        ...(aiMode ? { aiMode: true } : {}),
        ...(aiGoal ? { aiGoal } : {}),
        ...(alertWebhookUrl ? { alertWebhookUrl } : {}),
        ...(alertEmails ? { alertEmails } : {}),
      });
      return { intent, result };
    }

    if (intent === "monitor_list") {
      const result = await monitorList(apiKey);
      return { intent, result };
    }

    if (intent === "monitor_changes") {
      const id = String(formData.get("id") ?? "").trim();
      if (!id) return { intent, error: "Enter a monitor ID." };
      const result = await monitorChanges(apiKey, id);
      return { intent, result };
    }

    if (intent === "monitor_control") {
      const id = String(formData.get("id") ?? "").trim();
      const controlAction = String(formData.get("action") ?? "") as MonitorControlAction;
      if (!id) return { intent, error: "Enter a monitor ID." };
      if (!["pause", "resume", "run_now", "delete"].includes(controlAction)) {
        return { intent, error: "Unknown monitor action." };
      }
      const result = await monitorControl(apiKey, id, controlAction);
      return { intent, result, controlAction };
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

/** Best-effort JSON pretty-print for responses whose shape isn't pinned down (see anakin.server.ts). */
function Json({ value }: { value: unknown }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto" }}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </s-box>
  );
}

export default function Monitors() {
  const { hasApiKey } = useLoaderData<typeof loader>();

  const createFetcher = useFetcher<typeof action>();
  const listFetcher = useFetcher<typeof action>();
  const changesFetcher = useFetcher<typeof action>();
  const controlFetcher = useFetcher<typeof action>();

  const [url, setUrl] = useState("");
  const [changesId, setChangesId] = useState("");
  const [controlId, setControlId] = useState("");

  const createError =
    createFetcher.data && "error" in createFetcher.data ? createFetcher.data.error : null;
  const createResult =
    createFetcher.data && "result" in createFetcher.data ? createFetcher.data.result : null;

  const listError =
    listFetcher.data && "error" in listFetcher.data ? listFetcher.data.error : null;
  const listResult =
    listFetcher.data && "result" in listFetcher.data ? listFetcher.data.result : null;

  const changesError =
    changesFetcher.data && "error" in changesFetcher.data ? changesFetcher.data.error : null;
  const changesResult =
    changesFetcher.data && "result" in changesFetcher.data ? changesFetcher.data.result : null;

  const controlError =
    controlFetcher.data && "error" in controlFetcher.data ? controlFetcher.data.error : null;
  const controlResult =
    controlFetcher.data && "result" in controlFetcher.data ? controlFetcher.data.result : null;

  const isCreating = createFetcher.state !== "idle";
  const isListing = listFetcher.state !== "idle";
  const isLoadingChanges = changesFetcher.state !== "idle";
  const isControlling = controlFetcher.state !== "idle";

  return (
    <s-page heading="Monitors">
      {!hasApiKey && (
        <s-banner tone="warning" heading="No API key saved yet">
          Save an Anakin API key on the{" "}
          <s-link href="/app">Market research</s-link> page before creating a
          monitor.
        </s-banner>
      )}

      <s-section heading="Create a monitor">
        <s-paragraph>
          Watches a URL on a schedule and records a change whenever the
          content differs — e.g. a competitor&rsquo;s price or stock page.
          Submits <code>POST /monitors</code>. Checks run at least every 15
          minutes; &ldquo;specific_data&rdquo; mode extracts and compares
          only the fields you care about with AI instead of the whole page.
        </s-paragraph>
        <createFetcher.Form method="post">
          <input type="hidden" name="intent" value="monitor_create" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="url"
              label="URL to watch"
              placeholder="https://competitor.com/products/example"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
            ></s-text-field>
            <s-stack direction="inline" gap="base">
              <s-number-field
                name="intervalMinutes"
                label="Check every (minutes)"
                defaultValue="60"
                min={15}
              ></s-number-field>
              <s-select name="watchMode" label="Watch mode">
                <s-option value="full_page" defaultSelected>
                  Whole page (2 credits/check)
                </s-option>
                <s-option value="specific_data">
                  Specific data only (3 credits/check)
                </s-option>
              </s-select>
            </s-stack>
            <s-checkbox
              name="aiMode"
              label="AI meaningful-change filtering (+1 credit/check)"
            ></s-checkbox>
            <s-text-field
              name="aiGoal"
              label="What counts as a meaningful change? (optional)"
              placeholder="only when the price drops or it goes out of stock"
            ></s-text-field>
            <s-text-field
              name="alertWebhookUrl"
              label="Alert webhook URL (optional)"
              placeholder="https://yourapp.com/webhooks/anakin-monitor"
            ></s-text-field>
            <s-text-field
              name="alertEmails"
              label="Alert emails (optional, comma-separated)"
              placeholder="ops@yourstore.com"
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isCreating ? { loading: true } : {})}
            >
              Create monitor
            </s-button>
          </s-stack>
        </createFetcher.Form>
        {createError && (
          <s-banner tone="critical" heading="Create failed">
            {createError}
          </s-banner>
        )}
        {createResult !== null && createResult !== undefined && <Json value={createResult} />}
      </s-section>

      <s-section heading="Your monitors">
        <s-paragraph>
          Submits <code>GET /monitors</code>. Copy a monitor&rsquo;s id below
          into the Changes / Control sections.
        </s-paragraph>
        <listFetcher.Form method="post">
          <input type="hidden" name="intent" value="monitor_list" />
          <s-button
            type="submit"
            disabled={!hasApiKey}
            {...(isListing ? { loading: true } : {})}
          >
            Refresh list
          </s-button>
        </listFetcher.Form>
        {listError && (
          <s-banner tone="critical" heading="Could not load monitors">
            {listError}
          </s-banner>
        )}
        {listResult !== null && listResult !== undefined && <Json value={listResult} />}
      </s-section>

      <s-section heading="Monitor changes">
        <s-paragraph>
          Submits <code>GET /monitors/:id/changes</code> — every detected
          change for a monitor, most recent first.
        </s-paragraph>
        <changesFetcher.Form method="post">
          <input type="hidden" name="intent" value="monitor_changes" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="id"
              label="Monitor ID"
              value={changesId}
              onChange={(e) => setChangesId(e.currentTarget.value)}
            ></s-text-field>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              {...(isLoadingChanges ? { loading: true } : {})}
            >
              Get changes
            </s-button>
          </s-stack>
        </changesFetcher.Form>
        {changesError && (
          <s-banner tone="critical" heading="Could not load changes">
            {changesError}
          </s-banner>
        )}
        {changesResult !== null && changesResult !== undefined && <Json value={changesResult} />}
      </s-section>

      <s-section heading="Pause, resume, run, or delete a monitor">
        <s-paragraph>
          Submits <code>POST /monitors/:id/pause|resume|run</code> or{" "}
          <code>DELETE /monitors/:id</code>. Delete is permanent.
        </s-paragraph>
        <controlFetcher.Form method="post">
          <input type="hidden" name="intent" value="monitor_control" />
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="id"
              label="Monitor ID"
              value={controlId}
              onChange={(e) => setControlId(e.currentTarget.value)}
            ></s-text-field>
            <s-select name="action" label="Action">
              <s-option value="pause" defaultSelected>
                Pause
              </s-option>
              <s-option value="resume">Resume</s-option>
              <s-option value="run_now">Run now</s-option>
              <s-option value="delete">Delete</s-option>
            </s-select>
            <s-button
              type="submit"
              disabled={!hasApiKey}
              tone="critical"
              {...(isControlling ? { loading: true } : {})}
            >
              Apply
            </s-button>
          </s-stack>
        </controlFetcher.Form>
        {controlError && (
          <s-banner tone="critical" heading="Action failed">
            {controlError}
          </s-banner>
        )}
        {controlResult !== null && controlResult !== undefined && <Json value={controlResult} />}
      </s-section>

      <s-section slot="aside" heading="About monitors">
        <s-paragraph>
          Active-monitor caps depend on your Anakin plan (Free 5, Pro 20,
          Scale 100) — separate from this app&rsquo;s own Shopify{" "}
          <s-link href="/app/billing">subscription</s-link>. Response shapes
          above are shown as raw JSON rather than a curated table, since
          Anakin&rsquo;s own client doesn&rsquo;t commit to a fixed field
          list for monitor objects either.
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
