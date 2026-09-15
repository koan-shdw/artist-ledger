import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { statementPdf } from "./.generated/pdf.mjs";
import { demoLedger, reportFor } from "../app/lib/ledger.ts";
test("PDF exports multiple artists with pagination and preserves the input snapshot", async () => {
  const data = demoLedger();
  const r = reportFor(data, "2026-08", data.artists[0].id);
  r.artist.name = "Sample 山田";
  r.lines = Array.from({ length: 65 }, (_, i) => ({
    ...r.lines[0],
    id: "l" + i,
    productId: "p" + i,
    title: "Product " + i + " - a long title for an artist print",
  }));
  const before = JSON.stringify(r);
  const bytes = await statementPdf(
    [{ report: r, saved: true }, { report: r }],
    new Uint8Array(fs.readFileSync("public/fonts/NotoSansJP-Regular.ttf")),
  );
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
  assert.equal(pdf.getTitle(), "Monthly artist sales statements");
  assert.equal(JSON.stringify(r), before);
  await assert.rejects(
    statementPdf([], new Uint8Array()),
    /Select at least one artist/,
  );
});
