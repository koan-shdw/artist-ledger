import test from "node:test";
import assert from "node:assert/strict";
const connections = new Map(),
  states = new Map(),
  claims = new Set();
globalThis.__gmailTestDb = {
  gmail: {
    connection: async (shop) => connections.get(shop),
    connect: async (shop, email, token) =>
      connections.set(shop, { email, token }),
    begin: async (state, shop, expires, verifier) =>
      states.set(state, { shop, expires, verifier }),
    bindBrowser: async (state, browser) => {
      const s = states.get(state);
      if (!s || s.browser || s.expires < Date.now()) return null;
      s.browser = browser;
      return s;
    },
    consume: async (state, browser) => {
      const s = states.get(state);
      if (!s || s.browser !== browser || s.expires < Date.now()) return null;
      states.delete(state);
      return s;
    },
    claim: async (id) => {
      if (claims.has(id)) return false;
      claims.add(id);
      return true;
    },
    release: async (id) => claims.delete(id),
    disconnect: async (shop) => connections.delete(shop),
  },
};
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.SHOPIFY_APP_URL = "https://ledger.example.com";
const gmail = await import("./.generated/gmail.mjs");
test("Gmail encryption is shop-bound and MIME preserves PDF bytes", () => {
  const encrypted = gmail.encryptToken("shop-one", "refresh-token");
  assert.equal(gmail.decryptToken("shop-one", encrypted), "refresh-token");
  assert.throws(() => gmail.decryptToken("shop-two", encrypted));
  const pdf = Buffer.from("%PDF-test bytes").toString("base64");
  const message = Buffer.from(
    gmail.gmailMessage({
      id: "1",
      from: "gallery@example.com",
      to: "artist@example.com",
      subject: "Artist statement",
      text: "Payment report",
      pdf,
      filename: "report.pdf",
    }),
    "base64url",
  ).toString();
  assert.match(message, /Content-Type: application\/pdf/);
  assert.ok(message.includes(pdf));
  assert.throws(() =>
    gmail.gmailMessage({
      id: "1",
      from: "gallery@example.com",
      to: "a@example.com\r\nBcc: other@example.com",
      subject: "test",
      text: "test",
      filename: "r.pdf",
    }),
  );
});
test("OAuth checks browser state, consumes once, and stores encrypted connection for its shop", async () => {
  const link = await gmail.beginGmail("one.myshopify.com");
  const start = await gmail.startGmail(new Request(link));
  const page = await start.text();
  assert.ok(page.includes("one.myshopify.com"));
  const url = new URL(page.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"));
  assert.match(url.searchParams.get("scope"), /gmail.send/);
  assert.doesNotMatch(
    url.searchParams.get("scope"),
    /gmail.read|mail.google.com/,
  );
  const callback =
    "https://ledger.example.com/auth/gmail/callback?state=" +
    url.searchParams.get("state") +
    "&code=test-code";
  await assert.rejects(
    gmail.finishGmail(new Request(callback)),
    /another browser/,
  );
  globalThis.fetch = async (url) =>
    String(url).includes("/token")
      ? Response.json({
          access_token: "access",
          refresh_token: "refresh",
          scope: "openid email https://www.googleapis.com/auth/gmail.send",
        })
      : Response.json({ email: "gallery@example.com", email_verified: true });
  const request = new Request(callback, {
    headers: { Cookie: start.headers.get("Set-Cookie").split(";")[0] },
  });
  assert.equal((await gmail.finishGmail(request)).email, "gallery@example.com");
  assert.equal(
    gmail.decryptToken(
      "one.myshopify.com",
      connections.get("one.myshopify.com").token,
    ),
    "refresh",
  );
  await assert.rejects(gmail.finishGmail(request), /expired/);
});
test("uncertain Gmail send cannot be repeated automatically", async () => {
  let sends = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/token"))
      return Response.json({ access_token: "access" });
    sends++;
    throw Error("timeout");
  };
  const input = {
    id: "uncertain",
    to: "artist@example.com",
    subject: "Report",
    text: "Statement",
    filename: "report.pdf",
  };
  await assert.rejects(gmail.sendGmail("one.myshopify.com", input), /timeout/);
  await assert.rejects(
    gmail.sendGmail("one.myshopify.com", input),
    /already attempted/,
  );
  assert.equal(sends, 1);
});
