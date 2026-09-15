import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLedger,
  reportFor,
  ledgerSchema,
  reportText,
} from "../app/lib/ledger.ts";
function fixture() {
  const d = emptyLedger();
  d.artists = [
    {
      id: "a",
      name: "Mark",
      email: "mark@example.com",
      enabled: true,
      galleryBps: 4000,
    },
  ];
  d.products = [
    {
      id: "p",
      title: "Painting",
      sku: "",
      artistId: "a",
      included: true,
      unitCost: 20000,
    },
  ];
  d.months["2026-08"] = {
    lines: [
      {
        id: "one",
        productId: "p",
        title: "Painting",
        order: "#1",
        quantity: 1,
        net: 100000,
      },
      {
        id: "two",
        productId: "p",
        title: "Painting",
        order: "#2",
        quantity: 1,
        net: 100000,
      },
    ],
    excluded: [],
    syncedAt: "",
    warnings: [],
  };
  return d;
}
test("zero gallery percentage applies only to the selected monthly sale", () => {
  const d = fixture();
  d.months["2026-09"] = structuredClone(d.months["2026-08"]);
  d.months["2026-08"].adjustments = {
    one: { net: 120000, cost: 10000, galleryBps: 0, note: "Special agreement" },
  };
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.net, 220000);
  assert.equal(r.cost, 30000);
  assert.equal(r.gallery, 32000);
  assert.equal(r.payout, 158000);
  assert.equal(reportFor(d, "2026-09", "a").payout, 96000);
  assert.equal(d.products[0].unitCost, 20000);
  assert.equal(d.artists[0].galleryBps, 4000);
  assert.equal(d.months["2026-08"].lines[0].net, 100000);
  assert.match(reportText(r), /Special agreement/);
  assert.match(reportText(r), /sale-specific rates/);
  delete d.months["2026-08"].adjustments.one;
  assert.equal(reportFor(d, "2026-08", "a").payout, 96000);
});
test("cost overrides can resolve missing costs and exclusion removes adjusted sales", () => {
  const d = fixture();
  d.products[0].unitCost = null;
  d.months["2026-08"].adjustments = {
    one: { cost: 0, galleryBps: 0 },
    two: { cost: 20000 },
  };
  assert.ok(
    !reportFor(d, "2026-08", "a").errors.some((e) => e.includes("cost")),
  );
  d.months["2026-08"].excluded = ["one"];
  assert.equal(reportFor(d, "2026-08", "a").payout, 48000);
  d.months["2026-08"].adjustments.two.galleryBps = 10001;
  assert.equal(ledgerSchema.safeParse(d).success, false);
});
test("sales-basis agreement respects a zero rate and 100 percent override", () => {
  const d = fixture();
  d.settings.basis = "sales";
  d.months["2026-08"].adjustments = {
    one: { galleryBps: 0 },
    two: { galleryBps: 10000 },
  };
  assert.equal(reportFor(d, "2026-08", "a").gallery, 100000);
  assert.equal(reportFor(d, "2026-08", "a").payout, 60000);
});
