import db from "../db.server";
import { randomUUID } from "node:crypto";
import { gmailConfigured, sendGmail } from "./gmail.server";
import {
  type Ledger,
  type Report,
  reportFor,
  reportText,
  monthLabel,
  rangeReport,
} from "./ledger";
export async function sendReports(
  shop: string,
  data: Ledger,
  month: string,
  artistIds: string[],
  manual?: { from: string; to: string; version: number },
  pdf?: string,
) {
  const gmail = await db.gmail.connection(shop);
  if (
    !(gmail && gmailConfigured()) &&
    (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
  )
    throw Error("Connect Gmail in Settings before sending reports");
  if (
    pdf !== undefined &&
    (pdf.length > 8_000_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf) ||
      !Buffer.from(pdf, "base64").subarray(0, 5).equals(Buffer.from("%PDF-")))
  )
    throw Error("Invalid PDF attachment or PDF exceeds the supported size");
  const unique = [...new Set(artistIds)];
  if (!unique.length || unique.length > 500)
    throw Error("Select between 1 and 500 artists");
  const reports = unique.map((id) => {
    const r = manual
      ? rangeReport(data, manual.from, manual.to, id)
      : reportFor(data, month, id);
    if (!manual && !pdf && !r.artist.enabled)
      throw Error(`${r.artist.name} is not selected for reports`);
    if (r.errors.length)
      throw Error(`${r.artist.name}: ${r.errors.join("; ")}`);
    if (r.payout < 0)
      throw Error(`${r.artist.name} has a negative balance requiring review`);
    return r;
  });
  if (manual) month = `manual:${manual.from}:${manual.to}:v${manual.version}`;
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
      let reportPdf = pdf;
      if (gmail && !reportPdf) {
        const { statementPdf } = await import("./statement-pdf");
        const font = await fetch(
          new URL("/fonts/NotoSansJP-Regular.ttf", process.env.SHOPIFY_APP_URL),
          { signal: AbortSignal.timeout(15000) },
        );
        if (!font.ok) throw Error("Could not load the PDF font");
        reportPdf = Buffer.from(
          await statementPdf(
            [{ report: draft, saved: true }],
            new Uint8Array(await font.arrayBuffer()),
          ),
        ).toString("base64");
        if (reportPdf && reportPdf.length > 8_000_000)
          throw Error("Report PDF exceeds the supported attachment size");
      }
      try {
        row = await db.artistReport.create({
          data: {
            id: randomUUID(),
            shop,
            month,
            artistId: draft.artist.id,
            snapshot: JSON.stringify({
              ...draft,
              ...(reportPdf ? { hasPdf: true } : {}),
              deliveryProvider: gmail ? "gmail" : "resend",
            }),
            status: "pending",
            ...(reportPdf ? { pdf: reportPdf } : {}),
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
    if (pdf && !JSON.parse(row.snapshot).hasPdf && row.status !== "sent")
      throw Error(
        "This delivery was already prepared without a PDF. Reconcile the original delivery before sending again.",
      );
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
      const attachment = r.hasPdf
        ? await db.artistReport.pdf(row.id, shop)
        : undefined;
      if (r.hasPdf && !attachment) throw Error("Saved PDF is unavailable");
      let providerId: string;
      if (r.deliveryProvider === "gmail") {
        providerId = await sendGmail(shop, {
          id: row.id,
          to: r.artist.email,
          replyTo: r.replyTo,
          subject: `${r.galleryName} — ${monthLabel(r.month)} artist sales statement`,
          text: reportText(r),
          pdf: attachment,
          filename: `artist-statement-${r.month.replaceAll("..", "-to-")}.pdf`,
        });
      } else {
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
            subject: `${r.galleryName} — ${monthLabel(r.month)} artist sales statement`,
            text: reportText(r),
            ...(attachment
              ? {
                  attachments: [
                    {
                      filename: `artist-statement-${r.month.replaceAll("..", "-to-")}.pdf`,
                      content: attachment,
                    },
                  ],
                }
              : {}),
          }),
          signal: AbortSignal.timeout(20000),
        });
        const result = (await response.json()) as { id?: string };
        if (!response.ok || !result.id)
          throw Error(`Email provider returned ${response.status}`);
        providerId = result.id;
      }
      await db.artistReport.update({
        where: { id: row.id },
        data: { status: "sent", providerId, error: null },
      });
      sent++;
    } catch (e) {
      await db.artistReport.update({
        where: { id: row.id },
        data: { status: "uncertain", error: (e as Error).message },
      });
      failures.push(
        r.deliveryProvider === "gmail"
          ? `${r.artist.name}: Gmail delivery not confirmed. ${(e as Error).message}`
          : `${r.artist.name}: delivery not confirmed. Retry within 23 hours; the same message ID prevents duplicates.`,
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
