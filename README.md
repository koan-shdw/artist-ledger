# Artist Ledger

An embedded Shopify app for galleries to prepare monthly artist statements and tell each artist what to invoice.

## Included

- Opens inside Shopify Admin using Shopify App Bridge and the official React Router authentication template.
- Per-artist gallery percentages, email addresses, and report recipient selection.
- Shopify vendor selection with automatic product assignment, editable unit costs, global product inclusion, and item selection within a month’s statement.
- Shopify sales sync with pagination, store timezone boundaries, net amounts after discounts/refunds, and explicit tax/shipping exclusion.
- Downloadable artist statements and CSV summaries.
- Built-in Google OAuth in Settings: connect Gmail to send PDF statements from your own account. Resend is also supported. Each artist receives only their own statement.
- Optional monthly sending through Cloudflare Cron Triggers, processed in resumable steps.
- Separate Cloudflare D1 records for every installed store, optimistic edit checks, frozen statement snapshots, duplicate-send protection, and verified Shopify uninstall/privacy webhooks.

## Current status

The Cloudflare version is deployed and installed in SHDW Gallery. A live sales import completed successfully. Email delivery and historical-order approval remain unconfigured in that deployment. The app has not completed Shopify App Store review. The separate Sites preview uses sample data.

## Installation

Follow the [step-by-step installation guide](docs/INSTALLATION.md) to register the Shopify app, host its server and database, configure email, and install it in your store.

## Calculation rules

Amounts use integer minor units (cents for USD, GBP, EUR, AUD, CAD and NZD; whole yen for JPY). Each artist’s gallery percentage supports two decimal places.

Default: `artist balance = net product sales − product costs − round(max(0, net product sales − product costs) × gallery percentage)`.

Alternative: `artist balance = net product sales − product costs − round(net product sales × gallery percentage)`.

Invoice amount is the positive artist balance, or zero when negative. Negative balances stop sending and need review; automatic carry-forward is not implemented.

Reports include selected items from paid, partially refunded, or refunded orders **placed in the chosen month**, net of removed/refunded quantities at sync time. Test, cancelled, pending, unpaid, and partially paid orders are excluded. Shopify supplies the net item price excluding tax; shipping is excluded. Product costs apply to remaining units. The gallery percentage rounds separately for each included sales line, and the artist receives the remainder so totals balance.

Historical costs are initially imported from the current Shopify inventory unit cost, not an historical cost ledger. Review and override them before sending. Sent statements freeze the cost, percentage, item selection, recipient, reply-to, and totals.

This is an order-month statement workflow, not a cash-basis accounting ledger. Later refunds on already issued months, order adjustments without item allocations, nonrecoverable production costs on returns, gift-card recognition, invoice taxes, and credit carry-forwards require reconciliation. Refunds without item allocations block sending; the app cannot infer their artist allocation. Re-syncing never rewrites a sent statement. Revised statement and credit-note workflows are not included in this version.

Supported currencies: USD, GBP, EUR, AUD, CAD, NZD, JPY. Each installed shop reports in its shop currency. Exchange conversion is not performed.

## Production hosting

Deploy to Cloudflare Workers with a D1 database using the [installation guide](docs/INSTALLATION.md). Each independent deployment uses its own Shopify registration, database, and secrets. The repository's configuration identifies the SHDW deployment; replace those values before deploying your own copy.

Configure these secrets on the host:

- `SHOPIFY_API_SECRET`
- Gmail: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY` — follow the [Gmail setup guide](docs/gmail-setup.md) once per hosted installation. Each merchant then uses **Connect Gmail** in Settings.
- Alternative Resend sender: `RESEND_API_KEY`, `EMAIL_FROM` using a verified sending domain
- Optional `CRON_SECRET` for the manual scheduler endpoint

Set public `SHOPIFY_API_KEY`, `SHOPIFY_APP_URL`, and `SCOPES` values in `wrangler.jsonc`. Set the same app URL and callback URL in `shopify.app.toml`. Run `npm run deploy:cloudflare` to host the server and `npx @shopify/cli app deploy --allow-updates` to release Shopify configuration. Back up D1 and monitor Worker errors. Free-tier capacity is governed by Cloudflare's current allowances; this version caps each serialized workspace at 1.5 MB.

App and Shopify staff access use the store’s app permissions. All gallery queries are scoped to the authenticated shop. The app optionally imports buyer names for internal sales review when Shopify grants access; buyer names are excluded from artist PDFs and emails. Shopify sessions use a D1 storage adapter. Uninstall removes the store’s app data and sessions; export needed statements before uninstalling. Verified privacy webhooks also support shop erasure.

## Email and scheduler

Connect Gmail in Settings after completing the [one-time host setup](docs/gmail-setup.md), or configure Resend with a verified sender. No email is sent during installation or tests. In Settings, set the gallery reply-to email. Manual sending requires saved changes, valid artist emails, known costs, included sales items, and no unresolved refund warnings or negative balances.

The included Cloudflare Cron Trigger runs every minute. On the first day of the month after 12:00 UTC, it creates jobs for opted-in stores covering the previous month, using each store’s timezone to select orders. Each invocation advances one import step or sends one artist statement. Jobs persist in D1 and use leases to prevent concurrent processing. Enable **Automatic monthly** for each artist in Monthly reports and save. Enabling an artist also enables the store scheduler; Settings provides the store-wide pause switch. Artists without this explicit opt-in are not emailed automatically. Failed runs require review; the merchant can complete eligible reports with Review & send. The latest job result is visible in Settings. The optional protected `/jobs/monthly` endpoint advances one step using `Authorization: Bearer YOUR_CRON_SECRET`.

Each artist/month has one immutable report. Sent reports are skipped. Gmail deliveries with an uncertain result are blocked from automatic retransmission; check Sent mail before reconciling them. Resend requests may be retried within 23 hours with the same provider idempotency key and snapshot. A successful provider response means accepted for delivery, not proof of inbox arrival. Bounce/delivery webhook handling is not included.

## Sharing and installation on other stores

For unrelated merchants, select **public distribution** through Shopify’s Partner Dashboard, complete the listing and requirements, and obtain Shopify app review approval. Custom distribution supports one store or stores within the same Plus organization. The distribution choice cannot later be changed. Anyone can host an independent copy from this repository with their own registration.

The install link comes from the actual registered Shopify app after the required setup. The preview URL and this source ZIP are not Shopify install links.

## Checks

- `npm test`: payout, exclusion, currency, validation, CSV safety, timezone, pagination, refund handling, and sync failure tests.
- `npm run typecheck`: React Router route generation and TypeScript checks.
- `npm run build`: client and server production bundles.

The test suite covers real local D1 operations, session persistence, shop isolation, resumable imports, monthly job claims, Gmail OAuth, PDF attachments, duplicate-send protection and manual report items. TypeScript and the production build pass. Live Shopify installation and sales import have been verified. Email delivery, historical access, and a full scheduled production run still need verification.

## Sources

- Shopify embedded app template: https://github.com/Shopify/shopify-app-template-react-router
- App authentication: https://shopify.dev/docs/api/shopify-app-react-router/latest
- Admin GraphQL API: https://shopify.dev/docs/api/admin-graphql/2026-07
- Distribution rules: https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
- Order access: https://shopify.dev/docs/api/usage/access-scopes#orders-permissions

## License and free use

Artist Ledger is open source under the [MIT license](LICENSE.md). Anyone can use, modify, and share the code for free, including for commercial use. The app has no license fee or billing integration. Hosting, database, email-provider, domain, and Shopify charges are separate.

Based on the Shopify React Router app template; its original copyright and MIT license are retained. Third-party packages retain their respective licenses. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Sending a past month

1. Choose the required month and year in **Report month**.
2. Click **Sync Shopify sales**. For months older than 60 days, first obtain Shopify approval for the app’s `read_all_orders` request and release the optional scope; the merchant can then click **Enable historical-order access** in Settings.
3. Select the artist(s), review product costs and included items, and save changes.
4. Open an artist statement and click **Review & send to artist**, or use **Review & send** for the selected group.
5. Review the selected month, recipient, and invoice amount before sending. Previously sent artist/month statements are retained and skipped.

Historical reports reflect the chosen order month net of refunds as of the sync date. They do not recreate a past snapshot of prices or costs that Shopify no longer supplies; confirm costs before issuing them.

## PDF statements

Open an artist statement and choose **Download PDF**, or select artists and choose **Export PDF** for a combined document with each artist starting on a new page. Save edits before exporting. PDFs group included sales by product variant and show quantities, net sales, product costs, gallery share, and invoice amount. Incomplete agreements and unresolved reporting issues produce a clearly marked draft. Previously saved report snapshots retain their original figures.

PDFs are generated in the browser for downloads and individual sends, and on the server for bulk and automatic Gmail delivery. The bundled Noto Sans JP font supports Japanese artist and product names and is licensed under the SIL Open Font License in `public/fonts/LICENSE.txt`. Gmail delivery includes the itemised statement in the message body and a PDF attachment.

## Monthly sales adjustments

Open **Review all sales** from Monthly reports, or **Monthly sales** from the menu. Select a month to see its imported sales across every artist. Edit a sale's total net amount, total product cost, gallery percentage, and adjustment note. Fields show Shopify's amount or the default cost/agreement in blue. Overrides use normal text colour. Zero is a valid override. Reset restores the defaults for that sale. Save changes before exporting or sending.

Adjustments are stored by month and Shopify sales-line ID, separately from the imported amounts, and survive re-syncs. Shopify data and default artist agreements are unchanged. Reports and PDFs use adjusted totals and include adjustment details. Percentage calculations are rounded for each sales line; cost-first agreements use that line’s non-negative margin. Review overrides after re-syncing refunds or changed orders.

Monthly adjustments and item inclusion are locked once the artist/month has a frozen delivery snapshot. Sent reports keep their original values. Issuing replacement statements is not implemented.

## Manual reports and date ranges

In Monthly sales, choose All artists or an individual artist, then a single month or From / To range. Sync all months in the range. Changes remain attached to each source sale and month. Artist totals sum the monthly calculations, preserving monthly rounding and cost treatment. Search filters visible rows; the Include checkboxes determine the report contents.

Save adjustments, then select Create manual report. Review recipient emails and amounts, export their PDF statements, or send individual itemised emails. Email delivery requires a configured sender. Each report covers the full selected date range. Missing costs, agreements, email addresses, incomplete imports and negative balances block sending.

Manual delivery uses separate immutable snapshots and deduplication keys from automatic monthly statements. Repeating the same range and saved workspace version skips already-sent recipients. A changed saved workspace version permits a new manual statement. Automatic monthly selection is independent of manual recipient selection.

## Final review of a monthly statement

Open an artist in Monthly reports to edit each included sale's amount, total cost, gallery percentage and note. Blue values are defaults. Save stores the draft; Send report saves pending edits, generates an itemised PDF in the browser and emails it to the saved artist address. This individual send does not require enabling automatic reports. Sender configuration and valid report data are required.

The individual statement send stores the exact PDF with the immutable report. Retries use the same attachment and message ID, and Download PDF retrieves that saved file. Attachments are capped at 8 MB of base64 data and stored in chunks within D1. Apply all database migrations when upgrading. Existing automatic and bulk text-email workflows remain available.

Click an email or percentage in the artist table, or Set percentage in Monthly reports, to edit the value in the cell. Enter or Save persists it; Cancel leaves it unchanged. Saving an inline artist setting also saves other pending workspace edits.

## Other report items

At the end of an artist’s monthly statement, choose **Add item**. Enter a description, quantity and unit amount. Choose **Deduct from artist** for purchases paid by the gallery, **Add to artist** for a credit, or **Additional sale · profit split** for sales outside Shopify. Additional sales also take a unit cost and artist percentage of profit. Apply each item, then Save the report.

Deductions reduce the balance; credits and the artist’s share of additional sales increase it. These items are saved for that artist and month, survive Shopify re-syncs, and appear in the PDF and email. Sent statement items are frozen.

Choose **Split cost** for a shared expense such as shipping. Enter quantity and cost per unit (use quantity 1 for a single total expense), and the artist’s percentage of the cost. New items use the artist’s saved agreement as the default. The artist’s portion reduces their balance; the remainder reduces the gallery share. Both portions appear on the report, PDF and email.
