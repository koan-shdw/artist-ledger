import db from "../db.server";
import { randomUUID } from "node:crypto";
import {
  type Ledger,
  type Report,
  reportFor,
  reportText,
  monthLabel,
} from "./ledger";
export async function sendReports(
  shop: string,
  data: Ledger,
  month: string,
  artistIds: string[],
) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw Error(
      "Configure RESEND_API_KEY and EMAIL_FROM before sending reports",
    );
  const unique = [...new Set(artistIds)];
  if (!unique.length || unique.length > 500)
    throw Error("Select between 1 and 500 artists");
  const reports = unique.map((id) => {
    const r = reportFor(data, month, id);
    if (!r.artist.enabled)
      throw Error(`${r.artist.name} is not selected for reports`);
    if (r.errors.length)
      throw Error(`${r.artist.name}: ${r.errors.join("; ")}`);
    if (r.payout < 0)
      throw Error(`${r.artist.name} has a negative balance requiring review`);
    return r;
  });
  let sent = 0,
    skipped = 0;
  const failures: string[] = [];
  for (const draft of reports) {
    let row = await db.artistReport.findUnique({
      where: {
        shop_month_artistId: { shop, month, artistId: draft.artist.id },
      },
    });
    if (!row) {
      try {
        row = await db.artistReport.create({
          data: {
            id: randomUUID(),
            shop,
            month,
            artistId: draft.artist.id,
            snapshot: JSON.stringify(draft),
            status: "pending",
          },
        });
      } catch (e) {
        row = await db.artistReport.findUnique({
          where: {
            shop_month_artistId: { shop, month, artistId: draft.artist.id },
          },
        });
        if (!row) throw e;
      }
    }
    if (row.status === "sent") {
      skipped++;
      continue;
    }
    if (Date.now() - row.createdAt.getTime() > 23 * 60 * 60 * 1000) {
      failures.push(
        `${draft.artist.name}: delivery requires manual reconciliation before another attempt`,
      );
      continue;
    }
    const r = JSON.parse(row.snapshot) as Report;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [r.artist.email],
          ...(r.replyTo ? { reply_to: r.replyTo } : {}),
          subject: `${r.galleryName} — ${monthLabel(month)} artist sales statement`,
          text: reportText(r),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json() as { id?: string };
      if (!response.ok || !result.id)
        throw Error(`Email provider returned ${response.status}`);
      await db.artistReport.update({
        where: { id: row.id },
        data: { status: "sent", providerId: result.id, error: null },
      });
      sent++;
    } catch (e) {
      await db.artistReport.update({
        where: { id: row.id },
        data: { status: "uncertain", error: (e as Error).message },
      });
      failures.push(
        `${r.artist.name}: delivery not confirmed. Retry within 23 hours; the same message ID prevents duplicates.`,
      );
    }
  }
  return {
    message: `${sent} reports sent. ${skipped} already sent.${failures.length ? " " + failures.join(" ") : ""}`,
    sent,
    skipped,
    failures,
  };
}
