import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory GDPR compliance webhook (App Store requirement, regardless of
// whether the app actually processes customer PII -- see
// https://shopify.dev/docs/apps/build/privacy-law-compliance). Real
// `authenticate.webhook(request)` verifies the HMAC on the raw body first
// (see node_modules/@shopify/shopify-api/lib/utils/hmac-validator.ts,
// specifically `validateHmacFromRequestFactory` -- confirmed by reading the
// installed package, cited in SUBMIT.md), so this handler only runs for
// requests that genuinely came from Shopify.
//
// This app never stores customer PII (its only per-shop data is the
// merchant's own Anakin API key in `ShopSettings` -- see prisma/schema.prisma),
// so there is nothing customer-specific to return here. Acknowledging with
// 200 within Shopify's required window is the whole obligation in that case.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop}: customer ${
      (payload as { customer?: { id?: number } }).customer?.id ?? "unknown"
    } requested their data. This app stores no customer PII (only a shop-level Anakin API key), so there is nothing to return.`,
  );

  return new Response();
};
