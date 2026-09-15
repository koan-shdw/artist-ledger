import { env } from "cloudflare:workers";
import {
  beginSync,
  advanceSync,
  finishSync,
  type SyncState,
} from "./sync-steps.server";
import { type Ledger } from "./ledger";
import { saveWorkspace } from "./store.server";
import { graphql } from "./shopify-sync.server";
type Admin = Parameters<typeof graphql>[0];
type Job = {
  id: string;
  shop: string;
  month: string;
  version: number;
  payload: string;
  revision: number;
};
export async function continueSync(
  admin: Admin,
  shop: string,
  version: number,
  data: Ledger,
  month: string,
  jobId?: string,
) {
  const db = env.DB;
  if (!jobId) {
    const state = await beginSync(admin, data, month);
    const payload = JSON.stringify(state);
    if (new TextEncoder().encode(payload).byteLength > 1500000)
      throw Error(
        "This import exceeds the current per-workspace size limit. No partial sales were saved.",
      );
    const id = crypto.randomUUID();
    await db
      .prepare(
        "DELETE FROM SyncJob WHERE updatedAt < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO SyncJob (id,shop,month,version,payload) VALUES (?,?,?,?,?)",
      )
      .bind(id, shop, month, version, payload)
      .run();
    return { pending: true, jobId: id, message: "Importing products", version };
  }
  const job = await db
    .prepare("SELECT * FROM SyncJob WHERE id=? AND shop=?")
    .bind(jobId, shop)
    .first<Job>();
  if (!job || job.month !== month || job.version !== version)
    throw Error(
      "Import expired or the workspace changed. Start the sync again.",
    );
  const state = await advanceSync(admin, JSON.parse(job.payload) as SyncState);
  if (state.phase === "complete") {
    const next = await saveWorkspace(shop, version, finishSync(state));
    await db
      .prepare("DELETE FROM SyncJob WHERE id=? AND shop=?")
      .bind(jobId, shop)
      .run();
    return {
      pending: false,
      version: next,
      message: "Shopify sales and products synced",
    };
  }
  const payload = JSON.stringify(state);
  if (new TextEncoder().encode(payload).length > 1500000)
    throw Error(
      "This import exceeds the current per-workspace size limit. No partial sales were saved.",
    );
  const result = await db
    .prepare(
      "UPDATE SyncJob SET payload=?,revision=revision+1,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND shop=? AND revision=?",
    )
    .bind(payload, jobId, shop, job.revision)
    .run();
  if (!result.meta.changes)
    throw Error("Another request advanced this import. Start the sync again.");
  return {
    pending: true,
    jobId,
    version,
    message:
      state.phase === "products"
        ? "Importing products"
        : "Imported " + state.orderCount + " orders",
  };
}
