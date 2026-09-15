import type { ActionFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { type Ledger, previousMonth, reportFor } from "../lib/ledger";
import { syncMonth } from "../lib/shopify-sync.server";
import { sendReports } from "../lib/email.server";
import { saveWorkspace } from "../lib/store.server";
export async function action({ request }: ActionFunctionArgs) {
  const secret = process.env.CRON_SECRET;
  const incoming = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    incoming.length !== expected.length ||
    !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  const month = previousMonth();
  const results = [];
  const rows = await db.galleryWorkspace.findMany();
  for (const row of rows) {
    const data = JSON.parse(row.payload) as Ledger;
    if (!data.settings.automatic) continue;
    const claim = `${row.shop}:${month}`;
    try {
      await db.monthlyRun.create({
        data: { id: claim, shop: row.shop, month, status: "running" },
      });
    } catch {
      continue;
    }
    try {
      const { admin } = await unauthenticated.admin(row.shop);
      const synced = await syncMonth(admin, data, month);
      await saveWorkspace(row.shop, row.version, synced);
      const eligible = synced.artists
        .filter((a) => a.enabled)
        .filter((a) => {
          const r = reportFor(synced, month, a.id);
          return r.errors.length === 0 && r.payout >= 0;
        });
      const result = eligible.length
        ? await sendReports(
            row.shop,
            synced,
            month,
            eligible.map((a) => a.id),
          )
        : {
            message:
              "No eligible artists. Review missing settings or refund exceptions.",
            failures: ["No eligible artists"],
          };
      const omitted =
        synced.artists.filter((a) => a.enabled).length - eligible.length;
      const summary =
        result.message +
        (omitted ? ` ${omitted} artist reports require review.` : "");
      await db.monthlyRun.update({
        where: { id: claim },
        data: {
          status:
            result.failures.length || omitted ? "needs_review" : "complete",
          result: summary,
        },
      });
      results.push({ shop: row.shop, message: summary });
    } catch (e) {
      await db.monthlyRun.update({
        where: { id: claim },
        data: { status: "failed", result: (e as Error).message },
      });
      results.push({ shop: row.shop, error: (e as Error).message });
    }
  }
  return Response.json({ month, results });
}
