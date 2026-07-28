/**
 * Shared "does this shop have an active plan + a saved Anakin API key"
 * loader logic, used by every /app/* page that calls into the Anakin API.
 *
 * Factored out of app._index.tsx (originally the app's only page) once the
 * app grew past one page, so every page gates on the same real Shopify
 * Billing subscription (`billing.require`, same MONTHLY_PLAN, same
 * `isTest: true` -- see app._index.tsx's original comment on why) instead
 * of re-deriving it per route.
 */
import type { LoaderFunctionArgs } from "react-router";

import { authenticate, MONTHLY_PLAN } from "./shopify.server";
import db from "./db.server";

export interface ShopContext {
  shop: string;
  hasApiKey: boolean;
  subscription: string | null;
}

/**
 * Gate a page's loader on an active Shopify subscription, same as
 * app._index.tsx's original loader. Throws/redirects (via
 * `billing.require`'s `onFailure`) when there's no active payment --
 * callers need `ErrorBoundary`/`headers` boundary exports so React Router
 * preserves that redirect's headers (see app._index.tsx for the pattern).
 */
export async function requireShopContext(
  request: LoaderFunctionArgs["request"],
): Promise<ShopContext> {
  const { session, billing } = await authenticate.admin(request);

  const billingCheck = await billing.require({
    plans: [MONTHLY_PLAN],
    isTest: true,
    onFailure: async () =>
      billing.request({ plan: MONTHLY_PLAN, isTest: true }),
  });

  const settings = await db.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  return {
    shop: session.shop,
    hasApiKey: Boolean(settings?.apiKey),
    subscription: billingCheck.appSubscriptions[0]?.name ?? null,
  };
}

/**
 * Look up just the saved Anakin API key inside an `action`, after the
 * page's loader has already gated access via requireShopContext. Returns
 * null when the shop hasn't saved a key yet (save one on /app first).
 */
export async function requireApiKey(
  request: LoaderFunctionArgs["request"],
): Promise<string | null> {
  const { session } = await authenticate.admin(request);
  const settings = await db.shopSettings.findUnique({
    where: { shop: session.shop },
  });
  return settings?.apiKey ?? null;
}
