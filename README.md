# Artist Ledger

An embedded Shopify app for galleries to prepare monthly artist statements and tell each artist what to invoice.

## Included

- Opens inside Shopify Admin using Shopify App Bridge and the official React Router authentication template.
- Per-artist gallery percentages, email addresses, and report recipient selection.
- Product variant assignment, editable unit costs, global product inclusion, and item selection within a month’s statement.
- Shopify sales sync with pagination, store timezone boundaries, net amounts after discounts/refunds, and explicit tax/shipping exclusion.
- Downloadable artist statements and CSV summaries.
- Reviewed email sending through Resend; selected artists each receive only their own statement.
- Optional monthly sending through a protected scheduler endpoint.
- Separate PostgreSQL records for every installed store, optimistic edit checks, frozen statement snapshots, duplicate-send protection, and verified Shopify uninstall/privacy webhooks.

## Current status

The source package is built and locally tested. It has not been installed in a real store, deployed to an app host, connected to an email sender, or approved by Shopify. The separate Sites preview uses sample data and cannot send email or connect to stores.

## Installation

Follow the [step-by-step installation guide](docs/INSTALLATION.md) to register the Shopify app, host its server and database, configure email, and install it in your store.

## Calculation rules

Amounts use integer minor units (cents for USD, GBP, EUR, AUD, CAD and NZD; whole yen for JPY). Each artist’s gallery percentage supports two decimal places.

Default: `artist balance = net product sales − product costs − round(max(0, net product sales − product costs) × gallery percentage)`.

Alternative: `artist balance = net product sales − product costs − round(net product sales × gallery percentage)`.

Invoice amount is the positive artist balance, or zero when negative. Negative balances stop sending and need review; automatic carry-forward is not implemented.

Reports include selected items from paid, partially refunded, or refunded orders **placed in the chosen month**, net of removed/refunded quantities at sync time. Test, cancelled, pending, unpaid, and partially paid orders are excluded. Shopify supplies the net item price excluding tax; shipping is excluded. Product costs apply to remaining units. The gallery percentage rounds once per artist statement, and the artist receives the remainder so totals balance.

Historical costs are initially imported from the current Shopify inventory unit cost, not an historical cost ledger. Review and override them before sending. Sent statements freeze the cost, percentage, item selection, recipient, reply-to, and totals.

This is an order-month statement workflow, not a cash-basis accounting ledger. Later refunds on already issued months, order adjustments without item allocations, nonrecoverable production costs on returns, gift-card recognition, invoice taxes, and credit carry-forwards require reconciliation. Refunds without item allocations block sending; the app cannot infer their artist allocation. Re-syncing never rewrites a sent statement. Revised statement and credit-note workflows are not included in this version.

Supported currencies: USD, GBP, EUR, AUD, CAD, NZD, JPY. Each installed shop reports in its shop currency. Exchange conversion is not performed.

## Production hosting

Deploy the included Dockerfile on a Node-capable HTTPS host with a durable PostgreSQL database. The included `compose.yml` can run both services; set `POSTGRES_PASSWORD` and do not expose the database port. Terminate HTTPS at your host or reverse proxy.

Configure these secrets on the host:

- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`
- `DATABASE_URL`
- `SCOPES=read_products,read_inventory,read_orders`
- `RESEND_API_KEY`, `EMAIL_FROM` using a verified sending domain
- `CRON_SECRET`, a random value of at least 32 characters

Set the app URL and callback URLs in `shopify.app.toml` to the real host. Run `shopify app deploy` to release Shopify configuration and webhooks. That command does not host the application server. Use PostgreSQL backups and HTTPS, keep database and secrets private, and configure monitoring on the app host.

App and Shopify staff access use the store’s app permissions. All gallery queries are scoped to the authenticated shop. The app does not request or store customer names, customer emails, or addresses. Session records are managed by Shopify’s official adapter. Uninstall removes the store’s app data and sessions; export needed statements before uninstalling. Verified privacy webhooks also support shop erasure.

## Email and scheduler

Set up Resend with a verified sender; no email is sent by this package during installation or tests. In Settings, set the gallery reply-to email. Manual sending requires saved changes, valid artist emails, known costs, included sales items, and no unresolved refund warnings or negative balances.

Schedule an HTTPS POST to `/jobs/monthly` on the first day of each month at 12:00 UTC, using header `Authorization: Bearer YOUR_CRON_SECRET`. The job targets the previous UTC calendar month, using each store’s timezone to select the orders. Enable automatic reporting separately in each store’s Settings. Monthly jobs are claimed once per shop/month; repeated scheduler calls cannot duplicate the run. Failed or interrupted runs require operator attention, and the merchant can complete eligible reports with Review & send. The latest job result is visible in Settings. For large installations, replace the sequential job endpoint with a persistent queue and per-store jobs; request timeouts can interrupt a large run.

Each artist/month has one immutable report and a unique provider idempotency key. Sent reports are skipped. Uncertain email requests may be retried within 23 hours using the same snapshot and key; after that, inspect provider logs and reconcile delivery before any operator reset. A successful provider response means accepted for delivery, not proof of inbox arrival. Bounce/delivery webhook handling is not included.

## Sharing and installation on other stores

For unrelated merchants, select **public distribution** in Shopify’s Dev Dashboard, complete the listing and requirements, and obtain Shopify app review approval. Custom distribution supports one store or stores within the same Plus organization. Do not choose custom distribution for a product intended for unrelated stores; the distribution choice cannot later be changed.

The install link comes from the actual registered Shopify app after the required setup. The preview URL and this source ZIP are not Shopify install links.

## Checks

- `npm test`: payout, exclusion, currency, validation, CSV safety, timezone, pagination, refund handling, and sync failure tests.
- `npm run typecheck`: React Router route generation and TypeScript checks.
- `npm run build`: client and server production bundles.

GitHub Actions verified the PostgreSQL migration on PostgreSQL 17, all 22 tests, TypeScript checks, the production build, and the Docker image build. Store OAuth installation, live Shopify sales sync, Resend delivery, Docker runtime startup, scheduler hosting, and App Store review still require verification after credentials and hosting are configured.

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
