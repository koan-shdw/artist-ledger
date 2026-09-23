import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { finishGmail } from "../lib/gmail.server";
export async function loader({ request }: LoaderFunctionArgs) {
  let result: { email?: string; error?: string };
  try {
    result = await finishGmail(request);
  } catch (error) {
    result = { error: (error as Error).message };
  }
  return Response.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie":
        "__Secure-ledger_gmail=; HttpOnly; Secure; SameSite=Lax; Path=/auth/gmail; Max-Age=0",
    },
  });
}
export default function GmailCallback() {
  const result = useLoaderData<typeof loader>() as {
    email?: string;
    error?: string;
  };
  return (
    <main
      style={{
        maxWidth: 600,
        margin: "60px auto",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>
        {result.error ? "Gmail connection needs attention" : "Gmail connected"}
      </h1>
      <p>
        {result.error ?? `Artist Ledger can send reports from ${result.email}.`}
      </p>
      <p>
        Return to Artist Ledger Settings to check the connection. You can close
        this tab.
      </p>
    </main>
  );
}
