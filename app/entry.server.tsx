import { renderToReadableStream } from "react-dom/server.browser";
import { ServerRouter, type EntryContext } from "react-router";
import { addDocumentResponseHeaders } from "./shopify.server";
export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  addDocumentResponseHeaders(request, headers);
  const body = await renderToReadableStream(
    <ServerRouter context={context} url={request.url} />,
    {
      signal: request.signal,
      onError(error) {
        console.error(error);
        status = 500;
      },
    },
  );
  headers.set("Content-Type", "text/html");
  return new Response(body, { status, headers });
}
