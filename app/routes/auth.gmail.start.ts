import type { LoaderFunctionArgs } from "react-router";
import { startGmail } from "../lib/gmail.server";
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    return await startGmail(request);
  } catch (error) {
    return new Response((error as Error).message, {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
