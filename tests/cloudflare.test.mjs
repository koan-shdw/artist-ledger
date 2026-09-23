import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { createDatabase } from "./.generated/d1.mjs";
import { D1SessionStorage } from "./.generated/sessions.mjs";
import { Session } from "@shopify/shopify-api";
import { emptyLedger } from "../app/lib/ledger.ts";
test("D1 persistence, concurrency, sessions, reports, and shop erasure", async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-08-01",
    d1Databases: ["DB"],
  });
  try {
    const binding = await mf.getD1Database("DB");
    const migration =
      (await readFile("migrations/0001_initial.sql", "utf8")) +
      (await readFile("migrations/0002_report_pdf.sql", "utf8"));
    await binding.batch(
      migration
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => binding.prepare(s)),
    );
    const db = createDatabase(() => binding);
    const storage = new D1SessionStorage(() => binding);
    const args = (shop) => ({
      where: { shop },
      create: { shop, payload: JSON.stringify(emptyLedger()) },
      update: {},
    });
    await db.galleryWorkspace.upsert(args("one.myshopify.com"));
    await db.galleryWorkspace.upsert(args("two.myshopify.com"));
    const results = await Promise.all(
      [1, 2].map(() =>
        db.galleryWorkspace.updateMany({
          where: { shop: "one.myshopify.com", version: 0 },
          data: {
            payload: JSON.stringify(emptyLedger()),
            version: { increment: 1 },
          },
        }),
      ),
    );
    assert.equal(
      results.reduce((n, r) => n + r.count, 0),
      1,
    );
    const s = new Session({
      id: "offline_one",
      shop: "one.myshopify.com",
      state: "state",
      isOnline: false,
      accessToken: "test-token",
      scope: "read_orders",
      expires: new Date("2027-01-01"),
      refreshToken: "test-refresh",
      refreshTokenExpires: new Date("2027-02-01"),
    });
    await storage.storeSession(s);
    const loaded = await storage.loadSession(s.id);
    assert.equal(loaded.refreshToken, "test-refresh");
    assert.equal(loaded.expires.toISOString(), s.expires.toISOString());
    assert.equal(
      loaded.refreshTokenExpires.toISOString(),
      s.refreshTokenExpires.toISOString(),
    );
    await db.updateSessionScope(s.id, "read_orders,read_products");
    assert.match((await storage.loadSession(s.id)).scope, /read_products/);
    const online = new Session({
      id: "online_two",
      shop: "two.myshopify.com",
      state: "state",
      isOnline: true,
      accessToken: "test",
      onlineAccessInfo: {
        expires_in: 3600,
        associated_user: {
          id: 123,
          first_name: "Test",
          last_name: "User",
          email: "test@example.com",
          account_owner: true,
          locale: "en",
          collaborator: false,
          email_verified: true,
        },
      },
    });
    await storage.storeSession(online);
    assert.equal(
      (await storage.loadSession(online.id)).onlineAccessInfo.associated_user
        .id,
      123,
    );
    const report = {
      pdf: "x".repeat(1_200_000),
      id: "report1",
      shop: "one.myshopify.com",
      month: "2026-08",
      artistId: "a",
      snapshot: "{}",
      status: "pending",
    };
    assert.ok(
      (await db.artistReport.create({ data: report })).createdAt instanceof
        Date,
    );
    await assert.rejects(
      db.artistReport.create({ data: { ...report, id: "report2" } }),
    );
    assert.equal(
      await db.artistReport.pdf("report1", "one.myshopify.com"),
      report.pdf,
    );
    assert.equal(await db.artistReport.pdf("report1", "two.myshopify.com"), "");
    await db.artistReport.update({
      where: { id: "report1" },
      data: { status: "sent", providerId: "test", error: null },
    });
    assert.equal(
      (
        await db.artistReport.findMany({
          where: { shop: "two.myshopify.com" },
          orderBy: {},
          take: 50,
        })
      ).length,
      0,
    );
    await db.deleteShop("one.myshopify.com");
    assert.equal(
      (await binding.prepare("SELECT count(*) AS n FROM ReportPdf").first()).n,
      0,
    );
    assert.equal(await storage.loadSession("offline_one"), undefined);
    assert.ok(await storage.loadSession("online_two"));
    assert.equal((await db.galleryWorkspace.findMany()).length, 1);
    globalThis.__testEnv = { DB: binding };
    const { continueSync } = await import("./.generated/sync-job.mjs");
    const d = emptyLedger();
    const admin = {
      graphql: async () =>
        Response.json({
          data: {
            shop: { currencyCode: "USD", ianaTimezone: "UTC", name: "Test" },
            currentAppInstallation: {
              accessScopes: [{ handle: "read_all_orders" }],
            },
          },
        }),
    };
    const started = await continueSync(
      admin,
      "two.myshopify.com",
      0,
      d,
      "2026-08",
    );
    await assert.rejects(
      continueSync(
        admin,
        "different.myshopify.com",
        0,
        d,
        "2026-08",
        started.jobId,
      ),
      /expired/,
    );
    await assert.rejects(
      continueSync(admin, "two.myshopify.com", 1, d, "2026-08", started.jobId),
      /expired/,
    );
  } finally {
    await mf.dispose();
  }
});
