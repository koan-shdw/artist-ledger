import { z } from "zod";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { type Ledger } from "../lib/ledger";
import { getWorkspace, parseEdits, saveWorkspace } from "../lib/store.server";
import { continueSync } from "../lib/sync-job.server";
import { sendReports } from "../lib/email.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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
    emailReady: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    sent: reports.map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })),
  });
}
export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  try {
    const body = z
      .object({
        action: z.enum(["save", "sync", "send"]),
        version: z.number().int().min(0),
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
        data: z.unknown().optional(),
        artistIds: z.array(z.string()).max(1).optional(),
        jobId: z.string().uuid().optional(),
      })
      .parse(await request.json());
    const row = await getWorkspace(session.shop);
    if (body.version !== row.version)
      throw Error("The workspace changed. Reload before continuing.");
    const data = JSON.parse(row.payload) as Ledger;
    if (body.action === "save")
      return Response.json({
        version: await saveWorkspace(
          session.shop,
          body.version,
          parseEdits(body.data, data),
        ),
      });
    if (!body.month) throw Error("Select a month");
    if (body.action === "sync")
      return Response.json(await continueSync(admin, session.shop, row.version, data, body.month, body.jobId));
    if (!body.artistIds) throw Error("Select artists");
    return Response.json(
      await sendReports(session.shop, data, body.month, body.artistIds),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
