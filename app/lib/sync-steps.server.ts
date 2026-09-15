import { linkVendorProducts } from "./ledger";
import { type Ledger, type Product, type SaleLine } from "./ledger";
import { graphql, amount, monthBounds } from "./shopify-sync.server";
import { QUERIES } from "./queries";
type Admin = Parameters<typeof graphql>[0];
// Shopify responses remain server-side. No continuation data is trusted from the browser.
export interface SyncState {
  phase: "products" | "orders" | "lines" | "complete";
  month: string;
  currency: string;
  start: string;
  end: string;
  data: Ledger;
  products: Product[];
  lines: SaleLine[];
  warnings: string[];
  after: string | null;
  moreOrders: boolean;
  orderCount: number;
  pending: any[];
  current: any | null;
}
export async function beginSync(
  admin: Admin,
  data: Ledger,
  month: string,
): Promise<SyncState> {
  const info = await graphql(admin, QUERIES.LedgerShop);
  const currency = info.shop.currencyCode;
  if (!["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "JPY"].includes(currency))
    throw Error("Unsupported shop currency");
  if (Object.keys(data.months).length && currency !== data.settings.currency)
    throw Error("Store currency changed. Review existing statements.");
  const { start, end } = monthBounds(month, info.shop.ianaTimezone);
  if (new Date(start) >= new Date())
    throw Error("Choose a month that has started");
  if (
    Date.parse(start) < Date.now() - 60 * 86400000 &&
    !info.currentAppInstallation.accessScopes.some(
      (s: { handle: string }) => s.handle === "read_all_orders",
    )
  )
    throw Error(
      "This month needs Shopify read_all_orders approval and access. No partial report was imported.",
    );
  const snapshot = structuredClone(data);
  snapshot.settings.currency = currency;
  if (snapshot.settings.galleryName === "Your gallery")
    snapshot.settings.galleryName = info.shop.name;
  return {
    phase: "products",
    month,
    currency,
    start,
    end,
    data: snapshot,
    products: snapshot.products,
    lines: [],
    warnings: [],
    after: null,
    moreOrders: true,
    orderCount: 0,
    pending: [],
    current: null,
  };
}
function addLines(s: SyncState, order: any, connection: any) {
  const products = new Set(s.products.map((p) => p.id));
  for (const line of connection.nodes) {
    if (!line.currentQuantity) continue;
    const cash = line.priceAfterAllDiscountsBeforeTaxesSet.shopMoney;
    if (cash.currencyCode !== s.currency)
      throw Error("Mixed currencies in Shopify shop amounts");
    const productId = line.variant?.id ?? "deleted:" + line.id;
    if (!products.has(productId)) {
      s.products.push({
        id: productId,
        title: line.name,
        sku: "",
        artistId: "",
        unitCost: null,
        included: true,
      });
      products.add(productId);
    }
    s.lines.push({
      id: line.id,
      productId,
      title: line.name,
      quantity: line.currentQuantity,
      net: amount(cash.amount, s.currency),
      order: order.name,
    });
  }
}
export async function advanceSync(
  admin: Admin,
  s: SyncState,
): Promise<SyncState> {
  if (s.phase === "complete") return s;
  if (s.phase === "products") {
    const page = await graphql(admin, QUERIES.LedgerProducts, {
      after: s.after,
    });
    const products = new Map(s.products.map((p) => [p.id, p]));
    for (const v of page.productVariants.nodes) {
      const fields = {
        title:
          v.product.title +
          (v.title === "Default Title" ? "" : " · " + v.title),
        sku: v.sku ?? "",
        vendor: v.product.vendor ?? "",
      };
      const existing = products.get(v.id);
      if (existing) Object.assign(existing, fields);
      else {
        const cost = v.inventoryItem?.unitCost;
        const p = {
          id: v.id,
          ...fields,
          artistId: "",
          unitCost:
            cost && cost.currencyCode === s.currency
              ? amount(cost.amount, s.currency)
              : null,
          included: true,
        };
        s.products.push(p);
        products.set(v.id, p);
      }
    }
    s.products = linkVendorProducts(s.products, s.data.artists);
    if (s.products.length > 50000)
      throw Error(
        "Catalog exceeds the current sync limit. No partial data was saved.",
      );
    s.after = page.productVariants.pageInfo.endCursor;
    if (!page.productVariants.pageInfo.hasNextPage) {
      s.phase = "orders";
      s.after = null;
    }
    return s;
  }
  if (s.phase === "orders") {
    if (!s.pending.length) {
      if (!s.moreOrders) {
        s.phase = "complete";
        return s;
      }
      const page = await graphql(admin, QUERIES.LedgerOrders, {
        after: s.after,
        query:
          "created_at:>=" + s.start + " created_at:<" + s.end + " status:any",
      });
      s.pending = page.orders.nodes;
      s.after = page.orders.pageInfo.endCursor;
      s.moreOrders = page.orders.pageInfo.hasNextPage;
      return s;
    }
    const order = s.pending.shift();
    if (
      order.test ||
      order.cancelledAt ||
      !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
        order.displayFinancialStatus,
      )
    )
      return s;
    if (++s.orderCount > 20000)
      throw Error(
        "Month exceeds the current sync limit. No partial data was saved.",
      );
    if (order.refunds.some((r: any) => !r.refundLineItems.nodes.length))
      s.warnings.push(
        order.name +
          " has a refund without item allocations. Reconcile it in Shopify before reporting.",
      );
    addLines(s, order, order.lineItems);
    if (order.lineItems.pageInfo.hasNextPage) {
      s.current = {
        id: order.id,
        name: order.name,
        after: order.lineItems.pageInfo.endCursor,
      };
      s.phase = "lines";
    }
    return s;
  }
  const page = await graphql(admin, QUERIES.LedgerOrderLines, {
    id: s.current.id,
    after: s.current.after,
  });
  addLines(s, s.current, page.order.lineItems);
  if (page.order.lineItems.pageInfo.hasNextPage)
    s.current.after = page.order.lineItems.pageInfo.endCursor;
  else {
    s.current = null;
    s.phase = "orders";
  }
  return s;
}
export function finishSync(s: SyncState): Ledger {
  if (s.phase !== "complete") throw Error("Sync has not finished");
  const lineIds = new Set(s.lines.map((l) => l.id));
  return {
    ...s.data,
    products: s.products,
    months: {
      ...s.data.months,
      [s.month]: {
        lines: s.lines,
        excluded: (s.data.months[s.month]?.excluded ?? []).filter((id) =>
          lineIds.has(id),
        ),
        syncedAt: new Date().toISOString(),
        warnings: [...new Set(s.warnings)],
      },
    },
  };
}
