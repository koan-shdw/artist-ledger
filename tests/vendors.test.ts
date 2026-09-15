import test from "node:test";
import assert from "node:assert/strict";
import {
  linkVendorProducts,
  emptyLedger,
  reportFor,
} from "../app/lib/ledger.ts";
test("vendor links calculate artist payout and keep suppliers separate", () => {
  const d = emptyLedger();
  d.artists = [
    {
      id: "a",
      name: "Artist",
      vendor: "Supplier A",
      email: "a@example.com",
      galleryBps: 4000,
      enabled: true,
    },
    {
      id: "b",
      name: "Other",
      vendor: "Supplier B",
      email: "b@example.com",
      galleryBps: 3000,
      enabled: true,
    },
  ];
  d.products = linkVendorProducts(
    [
      {
        id: "p",
        title: "Print",
        sku: "",
        vendor: "Supplier A",
        artistId: "",
        unitCost: 2000,
        included: true,
      },
      {
        id: "q",
        title: "Other",
        sku: "",
        vendor: "Supplier B",
        artistId: "",
        unitCost: 0,
        included: true,
      },
    ],
    d.artists,
  );
  d.months["2026-08"] = {
    lines: [
      {
        id: "l",
        productId: "p",
        title: "Print",
        quantity: 1,
        net: 10000,
        order: "#1",
      },
    ],
    excluded: [],
    syncedAt: "",
    warnings: [],
  };
  assert.deepEqual(
    d.products.map((p) => p.artistId),
    ["a", "b"],
  );
  assert.equal(reportFor(d, "2026-08", "a").invoice, 4800);
  assert.equal(reportFor(d, "2026-08", "b").invoice, 0);
  const moved = linkVendorProducts(
    [{ ...d.products[0], vendor: "Supplier B" }],
    d.artists,
  );
  assert.equal(moved[0].artistId, "b");
  assert.throws(
    () =>
      linkVendorProducts(d.products, [
        ...d.artists,
        { ...d.artists[0], id: "duplicate" },
      ]),
    /only one artist/,
  );
  assert.equal(
    linkVendorProducts([{ ...d.products[0], vendor: "Unknown" }], d.artists)[0]
      .artistId,
    "",
  );
});

test("vendors create artists automatically without guessing agreements", async () => {
  const { importVendorArtists } = await import("../app/lib/ledger.ts");
  const d = emptyLedger();
  d.products = [
    {
      id: "p",
      title: "Print",
      sku: "",
      vendor: "Supplier",
      artistId: "",
      unitCost: 100,
      included: true,
    },
  ];
  const linked = importVendorArtists(d);
  assert.equal(linked.artists.length, 1);
  assert.equal(linked.products[0].artistId, linked.artists[0].id);
  assert.equal(linked.artists[0].enabled, false);
  assert.equal(linked.artists[0].agreementConfigured, false);
  assert.deepEqual(importVendorArtists(linked), linked);
  linked.artists[0].email = "artist@example.com";
  linked.artists[0].galleryBps = 3500;
  linked.artists[0].agreementConfigured = true;
  linked.products.push({ ...d.products[0], id: "new" });
  const next = importVendorArtists(linked);
  assert.equal(next.products[1].artistId, next.artists[0].id);
  assert.equal(next.artists[0].galleryBps, 3500);
});
