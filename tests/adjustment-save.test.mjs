import test from "node:test";
import assert from "node:assert/strict";
import { parseEdits } from "./.generated/store.mjs";
import { demoLedger, reportFor } from "../app/lib/ledger.ts";
test("saving edits retains source sales and stores only valid monthly adjustments", () => {
  const data = demoLedger();
  const next = structuredClone(data);
  const key = "2026-08";
  const line = data.months[key].lines[0];
  next.months[key].lines[0].net = 1;
  next.months[key].adjustments = {
    [line.id]: {
      net: 50000,
      cost: 10000,
      galleryBps: 0,
      note: "Special agreement",
    },
    fake: { net: 1 },
  };
  const saved = parseEdits(next, data);
  assert.equal(saved.months[key].lines[0].net, line.net);
  assert.equal(saved.months[key].adjustments[line.id].galleryBps, 0);
  assert.equal(saved.months[key].adjustments.fake, undefined);
  const artist = data.products.find((p) => p.id === line.productId).artistId;
  assert.equal(
    reportFor(saved, key, artist).lines.find((l) => l.id === line.id).net,
    50000,
  );
});
