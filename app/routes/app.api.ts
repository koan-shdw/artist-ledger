import { z } from "zod";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { type Ledger } from "../lib/ledger";
import { getWorkspace, parseEdits, saveWorkspace } from "../lib/store.server";
import { continueSync } from "../lib/sync-job.server";
import { sendReports } from "../lib/email.server";
import { emailStatus, beginGmail, disconnectGmail } from "../lib/gmail.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (new URL(request.url).searchParams.has("emailStatus"))
    return Response.json(await emailStatus(session.shop), {
      headers: { "Cache-Control": "no-store" },
    });
  const pdfMonth = new URL(request.url).searchParams.get("pdfMonth");
  const pdfArtist = new URL(request.url).searchParams.get("pdfArtist");
  if (pdfMonth && pdfArtist) {
    const saved = await db.artistReport.findUnique({
      where: {
        shop_month_artistId: {
          shop: session.shop,
          month: pdfMonth,
          artistId: pdfArtist,
        },
      },
    });
    const pdf =
      saved && JSON.parse(saved.snapshot).hasPdf
        ? await db.artistReport.pdf(saved.id, session.shop)
        : undefined;
    if (!pdf) return new Response("No saved PDF", { status: 404 });
    return new Response(Buffer.from(pdf, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  }
  const row = await getWorkspace(session.shop);
  const reports = await db.artistReport.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const latestRun = await db.monthlyRun.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({
    latestRun,
    data: JSON.parse(row.payload),
    version: row.version,
    demo: false,
    shop: session.shop,
    ...(await emailStatus(session.shop)),
    sent: reports.map((r) => {
      const snapshot = JSON.parse(r.snapshot);
      return { ...r, snapshot, hasPdf: !!snapshot.hasPdf };
    }),
  });
}
export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  try {
    const body = z
      .object({
        action: z.enum([
          "save",
          "sync",
          "send",
          "sendManual",
          "sendStatement",
          "connectGmail",
          "disconnectGmail",
        ]),
        version: z.number().int().min(0).optional(),
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
        pdf: z.string().max(8_000_000).optional(),
        data: z.unknown().optional(),
        artistIds: z.array(z.string()).max(1).optional(),
        jobId: z.string().uuid().optional(),
      })
      .parse(await request.json());
    if (body.action === "connectGmail")
      return Response.json({ url: await beginGmail(session.shop) });
    if (body.action === "disconnectGmail") {
      await disconnectGmail(session.shop);
      return Response.json({ message: "Gmail disconnected" });
    }
    const row = await getWorkspace(session.shop);
    if (body.version !== row.version)
      throw Error("The workspace changed. Reload before continuing.");
    const data = JSON.parse(row.payload) as Ledger;
    if (body.action === "save") {
      const next = parseEdits(body.data, data);
      const frozen = await db.artistReport.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      for (const report of frozen) {
        const snapshot = JSON.parse(
          report.snapshot,
        ) as import("../lib/ledger").Report;
        const before = data.months[report.month],
          after = next.months[report.month];
        if (
          JSON.stringify(
            (before?.otherLines ?? []).filter(
              (line) => line.artistId === report.artistId,
            ),
          ) !==
          JSON.stringify(
            (after?.otherLines ?? []).filter(
              (line) => line.artistId === report.artistId,
            ),
          )
        )
          throw Error(
            "This statement is saved for delivery. Its other report items are locked.",
          );
        for (const line of before?.lines ?? []) {
          const artistId = data.products.find(
            (p) => p.id === line.productId,
          )?.artistId;
          if (
            artistId !== report.artistId &&
            !snapshot.lines.some((l) => l.id === line.id)
          )
            continue;
          if (
            JSON.stringify(before?.adjustments?.[line.id]) !==
              JSON.stringify(after?.adjustments?.[line.id]) ||
            before?.excluded.includes(line.id) !==
              after?.excluded.includes(line.id)
          )
            throw Error(
              "This artist's statement is already saved for delivery. Its sales adjustments are locked.",
            );
        }
      }
      return Response.json({
        version: await saveWorkspace(session.shop, body.version, next),
      });
    }
    if (!body.month) throw Error("Select a month");
    if (body.action === "sync")
      return Response.json(
        await continueSync(
          admin,
          session.shop,
          row.version,
          data,
          body.month,
          body.jobId,
        ),
      );
    if (!body.artistIds) throw Error("Select artists");
    if (body.action === "sendStatement" && !body.pdf)
      throw Error("Generate the PDF before sending");
    return Response.json(
      await sendReports(
        session.shop,
        data,
        body.month,
        body.artistIds,
        body.action === "sendManual"
          ? {
              from: body.month,
              to: body.to ?? body.month,
              version: row.version,
            }
          : undefined,
        body.action === "sendStatement" ? body.pdf : undefined,
      ),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
