import test from "node:test";
import assert from "node:assert/strict";
import { demoLedger } from "../app/lib/ledger.ts";
const rows = [];
let requests = [];
let fail = false;
globalThis.__ledgerTestDb = {
  artistReport: {
    async pdf(id, shop) {
      return rows.find((r) => r.id === id && r.shop === shop)?.pdf || "";
    },
    async findUnique({ where }) {
      const k = where.shop_month_artistId;
      return (
        rows.find(
          (r) =>
            r.shop === k.shop &&
            r.month === k.month &&
            r.artistId === k.artistId,
        ) || null
      );
    },
    async create({ data }) {
      if (
        rows.some(
          (r) =>
            r.shop === data.shop &&
            r.month === data.month &&
            r.artistId === data.artistId,
        )
      )
        throw Error("Duplicate");
      const row = { ...data, createdAt: new Date() };
      rows.push(row);
      return row;
    },
    async update({ where, data }) {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    },
  },
};
globalThis.__ledgerTestDb.gmail = { connection: async () => null };
process.env.RESEND_API_KEY = "test-only";
process.env.EMAIL_FROM = "test@example.com";
globalThis.fetch = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  if (fail) throw Error("Simulated network failure");
  return Response.json({ id: "mock-" + options.headers["Idempotency-Key"] });
};
const { sendReports } = await import("./.generated/email.mjs");

test("Gmail sends the saved PDF through the connected store account", async () => {
  const originalFetch=globalThis.fetch,originalGmail=globalThis.__ledgerTestDb.gmail;
  process.env.GMAIL_TOKEN_KEY=Buffer.alloc(32,7).toString("base64");
  process.env.GOOGLE_CLIENT_ID="test-client";
  process.env.GOOGLE_CLIENT_SECRET="test-secret";
  const {encryptToken}=await import("./.generated/gmail.mjs");
  const shop="gmail.myshopify.com";
  const token=encryptToken(shop,"refresh");
  globalThis.__ledgerTestDb.gmail={connection:async requested=>requested===shop?{email:"gallery@example.com",token}:null,claim:async()=>true};
  let mime="";
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes("/token"))return Response.json({access_token:"access"});
    assert.equal(String(url),"https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    mime=Buffer.from(JSON.parse(options.body).raw,"base64url").toString();
    return Response.json({id:"gmail-delivery"});
  };
  try {
    const pdf=Buffer.from("%PDF-test").toString("base64");
    const result=await sendReports(shop,demoLedger(),"2026-08",["a0"],undefined,pdf);
    assert.equal(result.sent,1);
    assert.match(mime,/From: gallery@example.com/);
    assert.match(mime,/To: alex.morgan@example.com/);
    assert.ok(mime.includes(pdf));
    assert.equal(JSON.parse(rows.find(row=>row.shop===shop).snapshot).deliveryProvider,"gmail");
  } finally {globalThis.fetch=originalFetch;globalThis.__ledgerTestDb.gmail=originalGmail;}
});
test("sending isolates shops, recipients, and months and skips duplicates", async () => {
  rows.length = 0;
  requests = [];
  const d = demoLedger();
  const first = await sendReports("one.myshopify.com", d, "2026-06", ["a0"]);
  assert.equal(first.sent, 1);
  assert.deepEqual(requests[0].body.to, ["alex.morgan@example.com"]);
  assert.match(requests[0].body.subject, /June 2026/);
  assert.doesNotMatch(requests[0].body.text, /Yuki/);
  const again = await sendReports("one.myshopify.com", d, "2026-06", ["a0"]);
  assert.equal(again.skipped, 1);
  assert.equal(requests.length, 1);
  await sendReports("two.myshopify.com", d, "2026-06", ["a0"]);
  assert.equal(requests.length, 2);
  assert.notEqual(
    requests[0].options.headers["Idempotency-Key"],
    requests[1].options.headers["Idempotency-Key"],
  );
});
test("uncertain delivery retries the frozen body and idempotency key", async () => {
  rows.length = 0;
  requests = [];
  fail = true;
  const d = demoLedger();
  d.settings.replyTo = "first@example.com";
  await sendReports("one.myshopify.com", d, "2026-07", ["a0"]);
  d.artists[0].email = "changed@example.com";
  d.artists[0].galleryBps = 9000;
  d.settings.replyTo = "changed@example.com";
  fail = false;
  await sendReports("one.myshopify.com", d, "2026-07", ["a0"]);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(
    requests[1].options.headers["Idempotency-Key"],
    requests[0].options.headers["Idempotency-Key"],
  );
});
test("expired uncertain deliveries require reconciliation", async () => {
  rows.length = 0;
  requests = [];
  fail = true;
  const d = demoLedger();
  await sendReports("one.myshopify.com", d, "2026-08", ["a0"]);
  rows[0].createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  fail = false;
  const result = await sendReports("one.myshopify.com", d, "2026-08", ["a0"]);
  assert.equal(requests.length, 1);
  assert.equal(result.sent, 0);
  assert.match(result.failures[0], /manual reconciliation/);
});

test("manual ranges are independent of monthly delivery and retry without duplicates", async () => {
  rows.length = 0;
  requests = [];
  fail = false;
  const d = demoLedger();
  await sendReports("one.myshopify.com", d, "2026-08", ["a0"]);
  d.artists[0].enabled = false;
  d.artists[0].automatic = false;
  const context = { from: "2026-07", to: "2026-08", version: 3 };
  const first = await sendReports(
    "one.myshopify.com",
    d,
    "2026-07",
    ["a0"],
    context,
  );
  assert.equal(first.sent, 1);
  assert.equal(rows.length, 2);
  assert.match(requests[1].body.subject, /July 2026.*August 2026/);
  assert.equal(
    JSON.parse(rows[1].snapshot).lines.length,
    d.months["2026-07"].lines.filter(
      (l) =>
        d.products.find((p) => p.id === l.productId)?.artistId === "a0" &&
        d.products.find((p) => p.id === l.productId)?.included &&
        !d.months["2026-07"].excluded.includes(l.id),
    ).length + JSON.parse(rows[0].snapshot).lines.length,
  );
  assert.equal(
    (await sendReports("one.myshopify.com", d, "2026-07", ["a0"], context))
      .skipped,
    1,
  );
  assert.equal(requests.length, 2);
});

test("statement delivery stores the PDF and reuses the identical attachment on retry", async () => {
  rows.length = 0;
  requests = [];
  fail = true;
  const d = demoLedger();
  d.artists[0].enabled = false;
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage();
  const pdf = Buffer.from(await doc.save()).toString("base64");
  await sendReports("one.myshopify.com", d, "2026-08", ["a0"], undefined, pdf);
  assert.equal(rows[0].status, "uncertain");
  assert.equal(JSON.parse(rows[0].snapshot).hasPdf, true);
  assert.equal(rows[0].pdf, pdf);
  assert.equal(requests[0].body.attachments[0].content, pdf);
  assert.match(requests[0].body.attachments[0].filename, /2026-08\.pdf$/);
  fail = false;
  d.artists[0].galleryBps = 9000;
  await sendReports("one.myshopify.com", d, "2026-08", ["a0"], undefined, pdf);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(rows[0].status, "sent");
  assert.equal(
    (
      await sendReports(
        "one.myshopify.com",
        d,
        "2026-08",
        ["a0"],
        undefined,
        pdf,
      )
    ).skipped,
    1,
  );
  await assert.rejects(
    sendReports(
      "one.myshopify.com",
      d,
      "2026-08",
      ["a0"],
      undefined,
      "invalid",
    ),
    /Invalid PDF/,
  );
});
