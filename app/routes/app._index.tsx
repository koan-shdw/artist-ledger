import type { LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import LedgerApp from "../components/ledger-app";
import "../globals.css";
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}
export default function Reports() {
  const shopify = useAppBridge();
  return (
    <LedgerApp
      endpoint="/app/api"
      embedded
      onRequestHistory={async () => {
        const response = await shopify.scopes.request(["read_all_orders"]);
        if (response.result !== "granted-all")
          throw Error(
            "Historical-order access was not granted. The app registration needs Shopify approval for read_all_orders.",
          );
      }}
    />
  );
}
