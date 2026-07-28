import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR compliance webhook. Sent ~48 hours after a merchant
// uninstalls the app (per shopify.dev's privacy-law-compliance doc --
// confirmed live, cited in SUBMIT.md). Unlike the two customers/* webhooks,
// this one this app *can* act on directly: it deletes the shop's saved
// Anakin API key, the one piece of shop-associated data this app stores.
//
// Note this runs in addition to, not instead of, webhooks.app.uninstalled.tsx
// (which fires immediately on uninstall and clears the Shopify session).
// shop/redact is Shopify's separate, delayed "actually purge the data now"
// signal, and apps are expected to honor it even if they already cleaned up
// on the uninstall webhook.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}: deleting saved Anakin API key.`);

  await db.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
