import test from "node:test";
import assert from "node:assert/strict";
import { syncMonth, monthBounds } from "./.generated/sync.mjs";
import { emptyLedger } from "../app/lib/ledger.ts";
import {beginSync,advanceSync,finishSync} from "./.generated/steps.mjs";
test("resumable sync survives serialization and matches the original sync",async()=>{
 const original=emptyLedger(); original.products=[{id:"p1",title:"Override",sku:"",artistId:"a",unitCost:999,included:false}];
 const expected=await syncMonth(mock().admin,original,month);
 const m=mock(); let state=await beginSync(m.admin,original,month);
 let ticks=0;
 while(state.phase!=="complete"){
  const before=m.seen.length;
  state=await advanceSync(m.admin,JSON.parse(JSON.stringify(state)));
  assert.ok(m.seen.length-before<=1,"At most one Shopify query per step");
  if(++ticks>30)throw Error("Sync never finished");
 }
 const actual=finishSync(state);
 actual.months[month].syncedAt=expected.months[month].syncedAt;
 assert.deepEqual(actual,expected);
 assert.equal(original.products[0].title,"Override");
});
const month = "2026-08";
const money = (amount) => ({ shopMoney: { amount, currencyCode: "USD" } });
const page = (nodes, more = false, cursor = null) => ({
  nodes,
  pageInfo: { hasNextPage: more, endCursor: cursor },
});
function mock(options = {}) {
  const seen = [];
  let orderPages = 0;
  const admin = {
    async graphql(q, { variables } = {}) {
      seen.push({ q, variables });
      let data;
      if (q.startsWith("query LedgerShop"))
        data = {
          shop: {
            currencyCode: "USD",
            ianaTimezone: "America/New_York",
            name: "Gallery",
          },
          currentAppInstallation: {
            accessScopes: [{ handle: "read_all_orders" }],
          },
        };
      else if (q.startsWith("query LedgerProducts"))
        data = {
          productVariants: variables.after
            ? page([
                {
                  id: "p2",
                  title: "Default Title",
                  sku: "2",
                  product: { title: "Second" },
                  inventoryItem: {
                    unitCost: { amount: "4.00", currencyCode: "USD" },
                  },
                },
              ])
            : page(
                [
                  {
                    id: "p1",
                    title: "Default Title",
                    sku: "1",
                    product: { title: "First" },
                    inventoryItem: {
                      unitCost: { amount: "2.00", currencyCode: "USD" },
                    },
                  },
                ],
                true,
                "vnext",
              ),
        };
      else if (q.startsWith("query LedgerOrders")) {
        orderPages++;
        data = {
          orders: page([
            {
              id: "o1",
              name: "#1",
              test: !!options.test,
              displayFinancialStatus: "PAID",
              cancelledAt: null,
              lineItems: page(
                [
                  {
                    id: "l1",
                    name: "First",
                    currentQuantity: 2,
                    variant: { id: "p1" },
                    priceAfterAllDiscountsBeforeTaxesSet: money("15.00"),
                  },
                ],
                true,
                "lnext",
              ),
              refunds: options.refund
                ? [{ refundLineItems: { nodes: [] } }]
                : [],
            },
          ]),
        };
      } else if (q.startsWith("query LedgerOrderLines"))
        data = {
          order: {
            lineItems: page([
              {
                id: "l2",
                name: "Second",
                currentQuantity: 1,
                variant: { id: "p2" },
                priceAfterAllDiscountsBeforeTaxesSet: money("8.00"),
              },
              {
                id: "l3",
                name: "Refunded",
                currentQuantity: 0,
                variant: { id: "p1" },
                priceAfterAllDiscountsBeforeTaxesSet: money("0"),
              },
            ]),
          },
        };
      else throw Error("Unexpected query");
      return Response.json({ data });
    },
  };
  return {
    admin,
    seen,
    get orderPages() {
      return orderPages;
    },
  };
}
test("month boundaries use shop timezone including DST", () => {
  assert.deepEqual(monthBounds("2026-03", "America/New_York"), {
    start: "2026-03-01T05:00:00.000Z",
    end: "2026-04-01T04:00:00.000Z",
  });
  assert.deepEqual(monthBounds("2026-12", "Asia/Tokyo"), {
    start: "2026-11-30T15:00:00.000Z",
    end: "2026-12-31T15:00:00.000Z",
  });
  assert.throws(() => monthBounds("2026-13", "UTC"));
});
test("sync reads all product and line-item pages, preserves costs and mappings", async () => {
  const d = emptyLedger();
  d.products = [
    {
      id: "p1",
      title: "Old title",
      sku: "old",
      artistId: "a",
      unitCost: 999,
      included: false,
    },
  ];
  const m = mock();
  const out = await syncMonth(m.admin, d, month);
  assert.equal(out.products.length, 2);
  assert.equal(out.products[0].unitCost, 999);
  assert.equal(out.products[0].artistId, "a");
  assert.equal(out.products[0].included, false);
  assert.equal(d.products[0].title, "Old title");
  assert.equal(out.months[month].lines.length, 2);
  assert.equal(
    out.months[month].lines.reduce((n, l) => n + l.net, 0),
    2300,
  );
  assert.ok(m.seen.some((x) => x.variables?.after === "vnext"));
  assert.ok(m.seen.some((x) => x.variables?.after === "lnext"));
});
test("sync excludes Shopify test orders", async () => {
  const out = await syncMonth(mock({ test: true }).admin, emptyLedger(), month);
  assert.equal(out.months[month].lines.length, 0);
});
test("unallocated refunds block report readiness", async () => {
  const out = await syncMonth(
    mock({ refund: true }).admin,
    emptyLedger(),
    month,
  );
  assert.equal(out.months[month].warnings.length, 1);
});
test("API failures leave the original ledger untouched", async () => {
  const d = emptyLedger();
  const original = JSON.stringify(d);
  await assert.rejects(
    syncMonth(
      {
        graphql: async () =>
          Response.json({ errors: [{ message: "Access denied" }] }),
      },
      d,
      month,
    ),
    /permissions/,
  );
  assert.equal(JSON.stringify(d), original);
});

test("older months require historical-order scope before any partial import", async () => {
  const m = mock();
  const admin = {
    async graphql(q, options) {
      if (q.startsWith("query LedgerShop"))
        return Response.json({
          data: {
            shop: { currencyCode: "USD", ianaTimezone: "UTC", name: "Gallery" },
            currentAppInstallation: { accessScopes: [] },
          },
        });
      return m.admin.graphql(q, options);
    },
  };
  await assert.rejects(
    syncMonth(admin, emptyLedger(), "2020-01"),
    /read_all_orders/,
  );
  assert.equal(m.seen.length, 0);
});
