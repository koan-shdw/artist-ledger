import type { ActionFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { monthlyTick } from "../lib/monthly.server";
export async function action({ request }: ActionFunctionArgs) {
  const secret = process.env.CRON_SECRET;
  const incoming = request.headers.get("authorization") ?? "";
  const expected = "Bearer " + (secret ?? "");
  if (
    !secret ||
    secret.length < 32 ||
    incoming.length !== expected.length ||
    !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  return Response.json(await monthlyTick());
}
