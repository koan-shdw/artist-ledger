# Gmail connection

Gmail is a built-in, per-store connection in **Settings → Send reports with Gmail**. Merchants authorize their own Google account. Artist Ledger requests `gmail.send`, `openid` and `email`; it cannot read inbox messages. The connected address is the sender. PDF statements are attached to manual and automatic Gmail reports.

## One-time setup for a self-hosted installation

1. Create or select a Google Cloud project and enable the Gmail API.
2. Configure Google Auth Platform branding and audience. A Workspace organization can use an Internal application for its own organization. An External app intended for other merchants must follow Google's publishing and sensitive-scope verification requirements. External Testing refresh tokens expire after seven days and are unsuitable for unattended monthly reporting.
3. Create a **Web application** OAuth client. Set the authorized redirect URI to `https://YOUR-APP-HOST/auth/gmail/callback`, matching `SHOPIFY_APP_URL` exactly.
4. Set Cloudflare Worker secrets with `wrangler secret put GOOGLE_CLIENT_ID` and `wrangler secret put GOOGLE_CLIENT_SECRET`. Never commit client secrets or tokens.
5. Generate a base64-encoded 32-byte random key and store it with `wrangler secret put GMAIL_TOKEN_KEY`. Keep this key stable and back it up securely; replacing it makes existing encrypted connections unreadable.
6. Apply D1 migrations, build and deploy the app using the README instructions. Migration `0003_gmail.sql` adds per-shop connections, expiring OAuth requests and delivery guards.
7. In the installed Shopify app, open **Settings → Connect Gmail**, choose the sending account and approve Google's request. Return to Settings and press **Check connection**. The connected address appears there.

Each store has its own encrypted refresh token. Tokens never appear in the workspace payload or browser API. OAuth uses a short-lived one-time state, a secure browser cookie and PKCE. Disconnect removes the connection and attempts to revoke Google's token; uninstall and shop erasure remove stored connection data.

Gmail does not accept idempotency keys. If a send times out after submission, Artist Ledger blocks automatic retransmission of that delivery. Check the connected account's Sent folder before reconciling it. A Message-ID alone does not prevent duplicate emails.

Google account sending limits still apply. Self-hosting is free software; Google account, hosting and provider limits are governed by their respective terms.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
