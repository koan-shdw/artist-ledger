import { importVendorArtists } from "./ledger";
import { type Ledger, type Product, type SaleLine, minorUnits } from "./ledger";
import { QUERIES } from "./queries";
type Admin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
export async function graphql(
  admin: Admin,
  query: string,
  variables: Record<string, unknown> = {},
) {
  const response = await admin.graphql(query, { variables });
  const body = (await response.json()) as {
    errors?: { message: string }[];
    data: any;
  };
  if (!response.ok || body.errors)
    throw Error(
      "Shopify could not complete the sync. Check app permissions and retry. " +
        (body.errors?.map((x: { message: string }) => x.message).join("; ") ??
          ""),
    );
  return body.data;
}
export async function addBuyerNames(admin: Admin, orders: any[]) {
  // Optional review context: unavailable customer permissions must not prevent sales sync.
  if (!orders.length) return;
  try {
    const response = await admin.graphql(
      "query BuyerNames($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id customer { firstName lastName } } } }",
      { variables: { ids: orders.map((order) => order.id) } },
    );
    const body = (await response.json()) as {
      data?: {
        nodes?: ({
          id: string;
          customer?: { firstName?: string; lastName?: string };
        } | null)[];
      };
    };
    for (const node of body.data?.nodes ?? []) {
      if (!node?.customer) continue;
      const order = orders.find((order) => order.id === node.id);
      if (order)
        order.buyerName = [node.customer.firstName, node.customer.lastName]
          .filter(Boolean)
          .join(" ");
    }
  } catch {
    /* Sales remain usable when optional buyer details are unavailable. */
  }
}
export function amount(value: string, currency: string) {
  const n = Number(value) * minorUnits(currency);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n)))
    throw Error("Invalid Shopify amount");
  return Math.round(n);
}
export function monthBounds(month: string, timezone: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw Error("Choose a valid month");
  const [y, m] = month.split("-").map(Number);
  function midnight(year: number, mon: number) {
    const target = Date.UTC(year, mon, 1);
    let t = target;
    for (let i = 0; i < 4; i++) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(t));
      const p = Object.fromEntries(parts.map((v) => [v.type, Number(v.value)]));
      const wall = Date.UTC(
        p.year,
        p.month - 1,
        p.day,
        p.hour,
        p.minute,
        p.second,
      );
      t += target - wall;
    }
    return new Date(t).toISOString();
  }
  return { start: midnight(y, m - 1), end: midnight(y, m) };
}
export async function syncMonth(
  admin: Admin,
  data: Ledger,
  month: string,
): Promise<Ledger> {
  const info = await graphql(admin, QUERIES.LedgerShop);
  const currency = info.shop.currencyCode;
  if (!["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "JPY"].includes(currency))
    throw Error(`Currency ${currency} is not supported yet`);
  if (Object.keys(data.months).length && data.settings.currency !== currency)
    throw Error(
      "Store currency changed. Review historical statements before syncing.",
    );
  const { start, end } = monthBounds(month, info.shop.ianaTimezone);
  if (new Date(start) >= new Date())
    throw Error("Choose a month that has started");
  if (
    new Date(start).getTime() < Date.now() - 60 * 24 * 60 * 60 * 1000 &&
    !info.currentAppInstallation.accessScopes.some(
      (s: { handle: string }) => s.handle === "read_all_orders",
    )
  )
    throw Error(
      "This month needs Shopify read_all_orders approval and access. No partial report was imported.",
    );
  const products: Product[] = data.products.map((p) => ({ ...p }));
  let after: string | null = null;
  let more = true;
  while (more) {
    const page = await graphql(admin, QUERIES.LedgerProducts, { after });
    for (const v of page.productVariants.nodes) {
      const existing = products.find((p) => p.id === v.id);
      const cost = v.inventoryItem?.unitCost;
      const fields = {
        title:
          v.product.title +
          (v.title === "Default Title" ? "" : " · " + v.title),
        sku: v.sku ?? "",
        vendor: v.product.vendor ?? "",
      };
      if (existing) Object.assign(existing, fields);
      else
        products.push({
          id: v.id,
          ...fields,
          artistId: "",
          unitCost:
            cost && cost.currencyCode === currency
              ? amount(cost.amount, currency)
              : null,
          included: true,
        });
    }
    more = page.productVariants.pageInfo.hasNextPage;
    after = page.productVariants.pageInfo.endCursor;
    if (products.length > 50000)
      throw Error("The product catalog exceeds the current sync limit");
  }
  const lines: SaleLine[] = [];
  const warnings: string[] = [];
  after = null;
  more = true;
  let orderCount = 0;
  while (more) {
    const page = await graphql(admin, QUERIES.LedgerOrders, {
      after,
      query: `created_at:>=${start} created_at:<${end} status:any`,
    });
    await addBuyerNames(admin, page.orders.nodes);
    for (const order of page.orders.nodes) {
      if (
        order.test ||
        order.cancelledAt ||
        !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
          order.displayFinancialStatus,
        )
      )
        continue;
      orderCount++;
      if (orderCount > 20000)
        throw Error(
          "This month exceeds the current sync limit. No partial data was saved.",
        );
      if (
        order.refunds.some(
          (r: { refundLineItems: { nodes: unknown[] } }) =>
            !r.refundLineItems.nodes.length,
        )
      )
        warnings.push(
          `${order.name} has a refund without item allocations. Reconcile it in Shopify before reporting.`,
        );
      let connection = order.lineItems;
      while (true) {
        for (const line of connection.nodes) {
          if (line.currentQuantity === 0) continue;
          const cash = line.priceAfterAllDiscountsBeforeTaxesSet.shopMoney;
          if (cash.currencyCode !== currency)
            throw Error("Mixed currencies in Shopify shop amounts");
          const productId = line.variant?.id ?? `deleted:${line.id}`;
          if (!products.some((p) => p.id === productId))
            products.push({
              id: productId,
              title: line.name,
              sku: "",
              artistId: "",
              unitCost: null,
              included: true,
            });
          lines.push({
            id: line.id,
            productId,
            title: line.name,
            quantity: line.currentQuantity,
            net: amount(cash.amount, currency),
            order: order.name,
            ...(order.buyerName ? { buyerName: order.buyerName } : {}),
          });
        }
        if (!connection.pageInfo.hasNextPage) break;
        const next = await graphql(admin, QUERIES.LedgerOrderLines, {
          id: order.id,
          after: connection.pageInfo.endCursor,
        });
        connection = next.order.lineItems;
      }
    }
    more = page.orders.pageInfo.hasNextPage;
    after = page.orders.pageInfo.endCursor;
  }
  return importVendorArtists({
    ...data,
    products,
    settings: {
      ...data.settings,
      currency,
      galleryName:
        data.settings.galleryName === "Your gallery"
          ? info.shop.name
          : data.settings.galleryName,
    },
    months: {
      ...data.months,
      [month]: {
        lines,
        adjustments: data.months[month]?.adjustments,
        otherLines: data.months[month]?.otherLines,
        excluded: (data.months[month]?.excluded ?? []).filter((id) =>
          lines.some((l) => l.id === id),
        ),
        syncedAt: new Date().toISOString(),
        warnings: [...new Set(warnings)],
      },
    },
  });
}
