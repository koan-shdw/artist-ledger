import db from "../db.server";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

const scope = "https://www.googleapis.com/auth/gmail.send";
const cookieName = "__Secure-ledger_gmail";
const redirectUri = () =>
  new URL("/auth/gmail/callback", process.env.SHOPIFY_APP_URL).href;
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
export const gmailConfigured = () =>
  !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GMAIL_TOKEN_KEY
  );
export async function emailStatus(shop: string) {
  const connection = await db.gmail.connection(shop);
  return {
    gmailEmail: connection?.email ?? null,
    gmailConfigured: gmailConfigured(),
    emailReady:
      !!(connection && gmailConfigured()) ||
      !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  };
}
function key() {
  const value = Buffer.from(process.env.GMAIL_TOKEN_KEY ?? "", "base64");
  if (value.length !== 32) throw Error("Gmail connection setup is incomplete");
  return value;
}
export function encryptToken(shop: string, token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(shop));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptToken(shop: string, value: string) {
  const bytes = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(shop));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function beginGmail(shop: string) {
  if (!gmailConfigured())
    throw Error("Gmail connection setup is not complete yet");
  const state = Buffer.from(randomBytes(32)).toString("base64url"),
    verifier = Buffer.from(randomBytes(32)).toString("base64url");
  await db.gmail.begin(
    hash(state),
    shop,
    Date.now() + 10 * 60 * 1000,
    verifier,
  );
  return new URL(
    "/auth/gmail/start?state=" + state,
    process.env.SHOPIFY_APP_URL,
  ).href;
}
export async function startGmail(request: Request) {
  const state = new URL(request.url).searchParams.get("state") ?? "";
  const browser = Buffer.from(randomBytes(32)).toString("base64url");
  const saved = await db.gmail.bindBrowser(hash(state), hash(browser));
  if (!saved)
    throw Error(
      "This connection link expired. Return to Settings and connect again.",
    );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${scope}`,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: hash(saved.verifier),
    code_challenge_method: "S256",
  }).toString();
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Gmail · Artist Ledger</title><style>body{font:16px system-ui;color:#183b35;max-width:520px;margin:80px auto;padding:24px;line-height:1.6}a{display:inline-block;background:#18594e;color:white;padding:10px 20px;border-radius:6px;text-decoration:none}</style><h1>Connect Gmail</h1><p>You are connecting a sending account to Artist Ledger for <strong>${escape(saved.shop)}</strong>.</p><p>Continue only if this is your store. People with access to this app in that store will be able to send artist reports from the Google account you choose.</p><a href="${escape(url.href)}">Continue to Google</a></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${cookieName}=${browser}; HttpOnly; Secure; SameSite=Lax; Path=/auth/gmail; Max-Age=600`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
async function tokenRequest(fields: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      ...fields,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      "Gmail authorization expired or was rejected. Reconnect Gmail in Settings.",
    );
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };
}
export async function finishGmail(request: Request) {
  const url = new URL(request.url),
    state = url.searchParams.get("state") ?? "";
  const browser =
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) ?? "";
  const saved = await db.gmail.consume(hash(state), hash(browser));
  if (!saved)
    throw Error(
      "This connection request expired or belongs to another browser. Connect again from Settings.",
    );
  if (url.searchParams.has("error"))
    throw Error("Gmail connection was cancelled. No mailbox was connected.");
  const code = url.searchParams.get("code");
  if (!code) throw Error("Google did not return an authorization code");
  const token = await tokenRequest({
    code,
    code_verifier: saved.verifier,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  if (!token.refresh_token || !token.scope?.split(" ").includes(scope))
    throw Error("Allow Gmail sending access to complete the connection.");
  const profile = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!profile.ok) throw Error("Could not verify the Gmail account");
  const identity = (await profile.json()) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!identity.email || !identity.email_verified)
    throw Error("Google did not confirm a verified email address");
  await db.gmail.connect(
    saved.shop,
    identity.email,
    encryptToken(saved.shop, token.refresh_token),
  );
  return { shop: saved.shop, email: identity.email };
}
export async function disconnectGmail(shop: string) {
  const connection = await db.gmail.connection(shop);
  if (connection) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        body: new URLSearchParams({
          token: decryptToken(shop, connection.token),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* Remove local access even if revocation is unavailable. */
    }
  }
  await db.gmail.disconnect(shop);
}
const header = (value: string) => {
  if (/[\r\n]/.test(value)) throw Error("Invalid email header");
  return value;
};
const folded = (value: string) => value.match(/.{1,76}/g)?.join("\r\n") ?? "";
export function gmailMessage(input: {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  pdf?: string;
  filename: string;
}) {
  const boundary = "ledger_" + hash(input.id);
  const lines = [
    `From: ${header(input.from)}`,
    `To: ${header(input.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`,
    `Message-ID: <${hash(input.id)}@artist-ledger>`,
    "MIME-Version: 1.0",
    ...(input.replyTo ? [`Reply-To: ${header(input.replyTo)}`] : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    folded(Buffer.from(input.text).toString("base64")),
  ];
  if (input.pdf)
    lines.push(
      `--${boundary}`,
      "Content-Type: application/pdf",
      `Content-Disposition: attachment; filename="${header(input.filename).replace(/["\\]/g, "")}"`,
      "Content-Transfer-Encoding: base64",
      "",
      folded(input.pdf),
    );
  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
export async function sendGmail(
  shop: string,
  input: Omit<Parameters<typeof gmailMessage>[0], "from">,
) {
  const connection = await db.gmail.connection(shop);
  if (!connection)
    throw Error("Connect Gmail in Settings before sending this report");
  const token = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: decryptToken(shop, connection.token),
  });
  const raw = gmailMessage({ ...input, from: connection.email });
  // Gmail has no idempotency key. Never automatically retry an uncertain send.
  if (!(await db.gmail.claim(input.id, shop)))
    throw Error(
      "This Gmail delivery was already attempted. Check Sent mail before any further delivery.",
    );
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500)
      await db.gmail.release(input.id, shop);
    throw Error(
      `Gmail rejected or could not confirm delivery (${response.status}). Check Gmail before retrying.`,
    );
  }
  const result = (await response.json()) as { id?: string };
  if (!result.id)
    throw Error("Gmail delivery was not confirmed. Check Sent mail.");
  return result.id;
}
