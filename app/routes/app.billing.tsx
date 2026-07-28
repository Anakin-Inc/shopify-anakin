import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";

import { authenticate, MONTHLY_PLAN } from "../shopify.server";

// Real Billing API read path: `billing.check()` (no `plans` filter) simply
// reports what's active, without throwing/redirecting the way
// `billing.require()` does on app._index.tsx's loader -- see the exact
// distinction documented on `BillingContext` in
// node_modules/@shopify/shopify-app-react-router's own type definitions
// (quoted in SUBMIT.md).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { hasActivePayment, appSubscriptions } = await billing.check({
    isTest: true,
  });

  return {
    hasActivePayment,
    // Pass the plan name through loader data instead of importing
    // MONTHLY_PLAN into the component directly -- shopify.server.ts pulls
    // in apiSecretKey and other server-only config, and React Router's
    // client bundle build fails fast (correctly) if a route component
    // imports it, since that would mean shipping server secrets to the
    // browser. Caught by a real `npm run build` failure while verifying
    // this file -- see SUBMIT.md.
    monthlyPlanName: MONTHLY_PLAN,
    subscriptions: appSubscriptions.map((sub) => ({
      id: sub.id,
      name: sub.name,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");

  if (!subscriptionId) {
    return { error: "Missing subscription id." };
  }

  // Real Billing API cancel path -- `appSubscriptionCancel` under the hood.
  await billing.cancel({ subscriptionId, isTest: true, prorate: true });

  return { ok: true };
};

export default function Billing() {
  const { hasActivePayment, subscriptions, monthlyPlanName } =
    useLoaderData<typeof loader>();
  const cancelFetcher = useFetcher<typeof action>();

  return (
    <s-page heading="Billing">
      <s-section heading="Current plan">
        {hasActivePayment ? (
          <s-stack direction="block" gap="base">
            {subscriptions.map((sub) => (
              <s-stack key={sub.id} direction="inline" gap="base">
                <s-text>{sub.name}</s-text>
                <cancelFetcher.Form method="post">
                  <input type="hidden" name="subscriptionId" value={sub.id} />
                  <s-button
                    type="submit"
                    variant="tertiary"
                    tone="critical"
                    {...(cancelFetcher.state !== "idle"
                      ? { loading: true }
                      : {})}
                  >
                    Cancel
                  </s-button>
                </cancelFetcher.Form>
              </s-stack>
            ))}
          </s-stack>
        ) : (
          <s-paragraph>
            No active subscription. Visit{" "}
            <s-link href="/app">the market research page</s-link> to start
            one — it will prompt you for the {monthlyPlanName} plan
            automatically.
          </s-paragraph>
        )}
      </s-section>

      <s-section slot="aside" heading="How this works">
        <s-paragraph>
          This is the app&rsquo;s own Shopify subscription (billed via Shopify&rsquo;s
          GraphQL{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate"
            target="_blank"
          >
            appSubscriptionCreate
          </s-link>{" "}
          mutation), separate from your Anakin API credit balance, which
          Anakin bills directly against the API key you saved on the market
          research page.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
