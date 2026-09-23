import test from "node:test";
import assert from "node:assert/strict";
import {
  demoLedger,
  emptyLedger,
  reportFor,
  artistSchema,
  reportsCsv,
  money,
} from "../app/lib/ledger.ts";
function fixture() {
  const d = emptyLedger();
  d.artists = [
    {
      id: "a",
      name: "Test Artist",
      email: "artist@example.com",
      galleryBps: 4000,
      enabled: true,
    },
  ];
  d.products = [
    {
      id: "p",
      title: "Print",
      sku: "P1",
      artistId: "a",
      unitCost: 2000,
      included: true,
    },
  ];
  d.months["2026-08"] = {
    lines: [
      {
        id: "l",
        productId: "p",
        title: "Print",
        quantity: 10,
        net: 100000,
        order: "#1",
      },
    ],
    excluded: [],
    syncedAt: "2026-09-01",
    warnings: [],
  };
  return d;
}
test("saved artist agreement is inherited; sale exception affects only that line and totals reconcile", () => {
  const d = fixture();
  d.artists[0].agreementConfigured = false;
  assert.ok(
    reportFor(d, "2026-08", "a").errors.includes(
      "Set the gallery percentage for this artist",
    ),
  );
  d.artists[0].agreementConfigured = true;
  d.months["2026-08"].lines.push({
    ...d.months["2026-08"].lines[0],
    id: "special",
    quantity: 1,
    net: 10000,
  });
  d.months["2026-08"].adjustments = { special: { galleryBps: 0 } };
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.lines[0].galleryBps, 4000);
  assert.equal(r.lines[0].payout, 48000);
  assert.equal(r.lines[1].payout, 8000);
  assert.equal(r.payout, 56000);
  assert.equal(r.errors.length, 0);
  assert.equal(
    r.lines.reduce((sum, line) => sum + line.payout!, 0),
    r.payout,
  );
  d.months["2026-08"].adjustments.special = { net: 0, cost: 0, galleryBps: 0 };
  assert.equal(reportFor(d, "2026-08", "a").lines[1].payout, 0);
});
test("cost-first agreement: 1000 sales less 200 costs split 40/60", () => {
  const r = reportFor(fixture(), "2026-08", "a");
  assert.equal(r.gallery, 32000);
  assert.equal(r.invoice, 48000);
  assert.equal(r.net, r.cost + r.gallery + r.payout);
});
test("gallery share of sales: 1000 - 200 - 400", () => {
  const d = fixture();
  d.settings.basis = "sales";
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.invoice, 40000);
});
test("per-artist percentages and boundary percentages", () => {
  const d = fixture();
  for (const [bps, expected] of [
    [0, 80000],
    [10000, 0],
    [3525, 51800],
  ]) {
    d.artists[0].galleryBps = bps;
    assert.equal(reportFor(d, "2026-08", "a").invoice, expected);
  }
});
test("excluded statement items remove both cost and sales", () => {
  const d = fixture();
  d.months["2026-08"].excluded = ["l"];
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.net, 0);
  assert.equal(r.cost, 0);
  assert.ok(r.errors.includes("No included sales items"));
});
test("unassigned and globally excluded items are not allocated", () => {
  const d = fixture();
  d.products[0].artistId = "";
  assert.equal(reportFor(d, "2026-08", "a").net, 0);
  d.products[0].artistId = "a";
  d.products[0].included = false;
  assert.equal(reportFor(d, "2026-08", "a").net, 0);
});
test("missing costs and emails block sending; zero costs are valid", () => {
  const d = fixture();
  d.products[0].unitCost = null;
  d.artists[0].email = "";
  assert.equal(reportFor(d, "2026-08", "a").errors.length, 2);
  d.products[0].unitCost = 0;
  d.artists[0].email = "a@example.com";
  assert.equal(reportFor(d, "2026-08", "a").errors.length, 0);
});
test("negative balance has no invoice and no gallery share after costs", () => {
  const d = fixture();
  d.products[0].unitCost = 20000;
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.invoice, 0);
  assert.equal(r.gallery, 0);
  assert.equal(r.payout, -100000);
});
test("rounding conserves money to the smallest currency unit", () => {
  const d = fixture();
  d.months["2026-08"].lines[0].net = 20001;
  d.artists[0].galleryBps = 5000;
  const r = reportFor(d, "2026-08", "a");
  assert.equal(r.gallery, 1);
  assert.equal(r.payout, 0);
  assert.equal(r.net, r.cost + r.gallery + r.payout);
});
test("JPY amounts have no decimal scaling", () => {
  assert.match(money(1000, "JPY"), /1,000/);
  assert.doesNotMatch(money(1000, "JPY"), /10\.00/);
});
test("email and percentage validation", () => {
  const a = fixture().artists[0];
  assert.equal(
    artistSchema.safeParse({ ...a, galleryBps: 10001 }).success,
    false,
  );
  assert.equal(artistSchema.safeParse({ ...a, email: "wrong" }).success, false);
});
test("refund exceptions propagate to readiness", () => {
  const d = fixture();
  d.months["2026-08"].warnings = ["Refund needs reconciliation"];
  assert.ok(
    reportFor(d, "2026-08", "a").errors.includes("Refund needs reconciliation"),
  );
});
test("each selected artist receives only assigned items", () => {
  const d = demoLedger();
  for (const a of d.artists) {
    const r = reportFor(d, "2026-08", a.id);
    assert.ok(
      r.lines.every(
        (l) => d.products.find((p) => p.id === l.productId)?.artistId === a.id,
      ),
    );
  }
});
test("CSV cells cannot start spreadsheet formulas", () => {
  const d = fixture();
  d.artists[0].name = "=1+1";
  const csv = reportsCsv([reportFor(d, "2026-08", "a")]);
  assert.ok(csv.includes('"\'=1+1"'));
});
