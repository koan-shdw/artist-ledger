import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await db.deleteShop(shop);
  }
  return new Response(null, { status: 200 });
}
