import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.artistReport.deleteMany({ where: { shop } }),
    db.monthlyRun.deleteMany({ where: { shop } }),
    db.galleryWorkspace.deleteMany({ where: { shop } }),
  ]);
  return new Response(null, { status: 200 });
}
