# Install Artist Ledger on Cloudflare

Artist Ledger runs inside Shopify Admin. Its server runs on Cloudflare Workers and its records are stored in Cloudflare D1. The code is free under the MIT license.

## Gallery staff

Once your operator has deployed and registered the app, open the Shopify installation link they provide, select your store, and click **Install**. Open **Apps → Artist Ledger** thereafter.

Choose a report month, sync sales, select artists from the Shopify vendor list, enter costs and gallery percentages, and save. Review each statement before sending. Sending becomes available after the operator configures a verified email sender.

## Deploy your own copy

These steps are for the person hosting an independent copy. Each copy needs its own Shopify app registration and Cloudflare resources.

### 1. Get the source

Fork this repository, clone your fork, and install Node.js 22.13 or later. Run:

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Check that the displayed Cloudflare account is the account you intend to use.

### 2. Register your Shopify app

Create an app in the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard). Copy its Client ID. Keep the Client Secret private. Replace `client_id` in `shopify.app.toml` with your Client ID.

### 3. Create the database

```sh
npx wrangler d1 create artist-ledger
```

In `wrangler.jsonc`, replace the database ID with the returned ID and set `account_id` to your own Cloudflare account ID. Set `SHOPIFY_API_KEY` to your Shopify Client ID. The binding must remain `DB`.

```sh
npm run migrate:cloudflare
npx wrangler secret put SHOPIFY_API_SECRET
```

Paste the Client Secret at the private prompt. Wrangler may offer to create the Worker when adding its first secret.

### 4. Deploy

Choose a Workers subdomain in Cloudflare's **Workers & Pages** account settings, or follow Wrangler's first-deploy prompt. Set `SHOPIFY_APP_URL` in `wrangler.jsonc` to the resulting app address, such as `https://artist-ledger.YOUR-SUBDOMAIN.workers.dev`.

Set `application_url` and the `/auth/callback` URL in `shopify.app.toml` to the same host. Keep the existing scopes and webhook paths.

```sh
npm run deploy:cloudflare
npx @shopify/cli app deploy --allow-updates
```

If you learned the final address during your first deployment, update both files and run both commands again. Open the app URL and confirm the Artist Ledger login page loads.

### 5. Install in your own store

In the Dev Dashboard, open your app's overview and click **Install app**. Select an eligible store in your organization and review Shopify's permissions before installing.

For distribution beyond your organization, use the [Partner Dashboard distribution workflow](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method). Public distribution supports unrelated merchants and requires Shopify review. Custom distribution supports a store or stores in one Plus organization. Shopify makes this choice permanent. A public source repository does not grant App Store approval.

### 6. Configure email

This version sends through Resend. Configure a sender domain you control, verify its DNS records, then set:

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

Use a verified sender such as `Your Gallery <statements@your-domain.com>`. In Artist Ledger Settings, set the gallery reply-to email. Send a reviewed test statement to an address you control before enabling artist delivery. Provider plans and sending limits are separate from app licensing; no paid plan is required by the source code.

### 7. Past months and automatic sending

Choose the month and year, then click **Sync Shopify sales**. For orders older than Shopify's default 60-day window, request `read_all_orders` access approval, add it to `optional_scopes` in `shopify.app.toml`, release a new version, and grant historical access in Artist Ledger Settings.

Automatic reports are disabled by default. The included Cloudflare Cron Trigger checks for work every minute. On the first day of each month after 12:00 UTC, opted-in stores receive a job for the previous month. Each tick advances one import step or sends one artist statement. Large runs take multiple ticks. Review failed or interrupted runs in Settings and complete eligible reports manually.

## Free tier and capacity

The deployment uses Workers and D1. Cloudflare's [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) define the current free allowances. The free Workers plan has a CPU budget per invocation; breaking imports into steps reduces request work but does not guarantee every store fits. Monitor live usage and failures before enabling automatic reports. Upgrading a plan requires the operator's choice.

This version stores each shop's workspace in one D1 row and caps it at 1.5 MB. Larger histories need a storage redesign. Imports stop before replacing the saved workspace when the supported size is exceeded. Shopify charges, domain registration, and email-provider usage remain separate.

## Development and checks

Use a separate Shopify app and development store. Copy `.dev.vars.example` to `.dev.vars`, supply development secrets, and configure development values in `wrangler.jsonc`. These local secret files are ignored by Git.

```sh
npm run setup
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
npm run dev
```

For embedded development, expose Vite over HTTPS and use that address in your development Shopify registration. Never point the production registration at a temporary development tunnel.

## Operation

Keep secrets out of Git. Back up D1 before upgrades and test restoring records. Uninstalling deletes that shop's sessions, workspace, imports, reports, and monthly jobs; export statements first. Watch Worker errors and email-provider delivery logs. Provider acceptance does not prove inbox delivery.

The optional `/jobs/monthly` endpoint advances one scheduler step and requires a `CRON_SECRET` Bearer token. The native Cloudflare Cron Trigger does not need that secret or an external scheduler.
