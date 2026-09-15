import { env } from "cloudflare:workers";
import { unauthenticated } from "../shopify.server";
import { continueSync } from "./sync-job.server";
import { sendReports } from "./email.server";
import { type Ledger, previousMonth, reportFor } from "./ledger";
type Task = {
  id: string;
  shop: string;
  month: string;
  payload: string;
  leaseUntil: number;
};
type Progress = {
  stage: "sync" | "send";
  jobId?: string;
  version?: number;
  artists?: string[];
  cursor?: number;
  omitted?: number;
  failed?: number;
};
export async function monthlyTick(now = new Date()) {
  const db = env.DB;
  // Claim at most one new store per tick; other opted-in stores follow on later ticks.
  if (now.getUTCDate() === 1 && now.getUTCHours() >= 12) {
    const month = previousMonth(now);
    await db
      .prepare(
        "INSERT OR IGNORE INTO MonthlyRun (id,shop,month,status,payload) SELECT shop || ':' || ?,shop,?,'running','{\"stage\":\"sync\"}' FROM GalleryWorkspace WHERE json_extract(payload,'$.settings.automatic')=1 AND NOT EXISTS (SELECT 1 FROM MonthlyRun WHERE id=GalleryWorkspace.shop || ':' || ?) LIMIT 1",
      )
      .bind(month, month, month)
      .run();
  }
  const task = await db
    .prepare(
      "SELECT id,shop,month,payload,leaseUntil FROM MonthlyRun WHERE status='running' AND leaseUntil<? ORDER BY createdAt LIMIT 1",
    )
    .bind(now.getTime())
    .first<Task>();
  if (!task) return { message: "No pending monthly reports" };
  const lease = now.getTime() + 300000;
  const claimed = await db
    .prepare(
      "UPDATE MonthlyRun SET leaseUntil=? WHERE id=? AND leaseUntil=? AND status='running'",
    )
    .bind(lease, task.id, task.leaseUntil)
    .run();
  if (!claimed.meta.changes)
    return { message: "Another worker claimed this report" };
  try {
    const row = await db
      .prepare("SELECT payload,version FROM GalleryWorkspace WHERE shop=?")
      .bind(task.shop)
      .first<{ payload: string; version: number }>();
    if (!row) throw Error("Store was removed");
    const data = JSON.parse(row.payload) as Ledger;
    if (!data.settings.automatic)
      throw Error("Automatic reporting was disabled");
    const progress = JSON.parse(task.payload) as Progress;
    if (progress.version !== undefined && progress.version !== row.version)
      throw Error(
        "Workspace changed during automatic reporting. Review and send manually.",
      );
    progress.version = row.version;
    let result = "Importing monthly sales";
    let status = "running";
    if (progress.stage === "sync") {
      const { admin } = await unauthenticated.admin(task.shop);
      const next = await continueSync(
        admin,
        task.shop,
        row.version,
        data,
        task.month,
        progress.jobId,
      );
      result = next.message;
      if (next.pending) progress.jobId = next.jobId;
      else {
        progress.version = next.version;
        progress.stage = "send";
        progress.cursor = 0;
        // Read the completed import on the next invocation before selecting recipients.
      }
    } else {
      if (!progress.artists) {
        const enabled = data.artists.filter((a) => a.enabled);
        progress.artists = enabled
          .filter((a) => {
            const r = reportFor(data, task.month, a.id);
            return !r.errors.length && r.payout >= 0;
          })
          .map((a) => a.id);
        progress.omitted = enabled.length - progress.artists.length;
      }
      const cursor = progress.cursor ?? 0;
      if (cursor < progress.artists.length) {
        const sent = await sendReports(task.shop, data, task.month, [
          progress.artists[cursor],
        ]);
        progress.failed = (progress.failed ?? 0) + sent.failures.length;
        progress.cursor = cursor + 1;
        result = sent.message;
      }
      if ((progress.cursor ?? 0) >= progress.artists.length) {
        const review = (progress.omitted ?? 0) + (progress.failed ?? 0);
        status =
          review || !progress.artists.length ? "needs_review" : "complete";
        result =
          "Processed " +
          progress.artists.length +
          " artist reports. " +
          review +
          " require review.";
      }
    }
    await db
      .prepare(
        "UPDATE MonthlyRun SET payload=?,result=?,status=?,leaseUntil=0 WHERE id=? AND leaseUntil=?",
      )
      .bind(JSON.stringify(progress), result, status, task.id, lease)
      .run();
    return { message: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Monthly reporting failed";
    await db
      .prepare(
        "UPDATE MonthlyRun SET status='failed',result=?,leaseUntil=0 WHERE id=? AND leaseUntil=?",
      )
      .bind(message, task.id, lease)
      .run();
    return { message };
  }
}
