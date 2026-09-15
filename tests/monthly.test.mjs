import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { demoLedger } from "../app/lib/ledger.ts";
test("monthly jobs advance one step, send one artist, and skip completed months", async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-08-01",
    d1Databases: ["DB"],
  });
  try {
    const db = await mf.getD1Database("DB");
    const migration = await readFile("migrations/0001_initial.sql", "utf8");
    await db.batch(
      migration
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
    const data = demoLedger();
    data.settings.automatic = true;
    data.artists.forEach(a => {a.automatic = a.id === "a0"; a.enabled = false;});
    await db
      .prepare("INSERT INTO GalleryWorkspace (shop,payload) VALUES (?,?)")
      .bind("one.myshopify.com", JSON.stringify(data))
      .run();
    globalThis.__monthlyEnv = { DB: db };
    let syncCalls = 0;
    const sends = [];
    globalThis.__monthlySync = async () => {
      syncCalls++;
      await db
        .prepare("UPDATE GalleryWorkspace SET version=1 WHERE shop=?")
        .bind("one.myshopify.com")
        .run();
      return { pending: false, version: 1, message: "Synced" };
    };
    globalThis.__monthlySend = async (shop, _data, month, artists) => {
      sends.push({ shop, month, artists });
      return { message: "Sent", failures: [] };
    };
    const { monthlyTick } = await import("./.generated/monthly.mjs");
    const now = new Date("2026-09-01T12:00:00Z");
    await monthlyTick(new Date("2026-09-01T11:00:00Z"));
    assert.equal(syncCalls, 0);
    await monthlyTick(now);
    assert.equal(syncCalls, 1);
    assert.equal(sends.length, 0);
    await monthlyTick(now);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].artists.length, 1);
    assert.equal(sends[0].month, "2026-08");
    for (let i = 0; i < 20; i++) await monthlyTick(now);
    const done = await db.prepare("SELECT status FROM MonthlyRun").first();
    assert.ok(["complete", "needs_review"].includes(done.status));
    const count = sends.length;
    assert.equal(count, 1);
    assert.equal(sends[0].artists[0], "a0");
    await monthlyTick(now);
    assert.equal(sends.length, count);
    assert.equal(syncCalls, 1);
    await db
      .prepare("UPDATE MonthlyRun SET status='running',leaseUntil=?")
      .bind(now.getTime() + 60000)
      .run();
    await monthlyTick(now);
    assert.equal(sends.length, count);
    await db.prepare("UPDATE MonthlyRun SET leaseUntil=0").run();
    data.settings.automatic = false;
    await db
      .prepare("UPDATE GalleryWorkspace SET payload=?")
      .bind(JSON.stringify(data))
      .run();
    await monthlyTick(now);
    assert.equal(
      (await db.prepare("SELECT status FROM MonthlyRun").first()).status,
      "failed",
    );
    assert.equal(sends.length, count);
  } finally {
    await mf.dispose();
  }
});
