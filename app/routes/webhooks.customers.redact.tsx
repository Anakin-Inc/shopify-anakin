import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory GDPR compliance webhook -- see webhooks.customers.data_request.tsx
// for the shared rationale. This app stores no customer-level data (its
// only per-shop table, `ShopSettings`, holds the merchant's own Anakin API
// key, not customer records), so there is nothing to redact per-customer.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop}: redact request for customer ${
      (payload as { customer?: { id?: number } }).customer?.id ?? "unknown"
    }. This app stores no customer-level data, so there is nothing to delete.`,
  );

  return new Response();
};
