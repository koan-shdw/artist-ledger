# Changelog

## 0.1.0

First packaged open-source release, hosted on Cloudflare Workers and D1 and embedded in Shopify Admin.

- Import artists and product assignments from Shopify vendors.
- Configure artist emails, gallery percentages, and automatic monthly delivery.
- Review historical months or date ranges and adjust individual sales before sending.
- Add deductions, credits, outside sales with profit splits, and shared expenses using **Split cost**.
- Show sales and other report items in separate PDF tables, including both portions of shared expenses.
- Connect a separate Gmail sending account for each store through Google OAuth.
- Preserve saved delivery snapshots and protect against duplicate sends.

### Installation and upgrades

Follow `docs/INSTALLATION.md` and `docs/gmail-setup.md`. Independent installations need their own Shopify registration, Cloudflare account/database and Google OAuth client. Replace the deployment-specific identifiers in `wrangler.jsonc` and `shopify.app.toml` before deploying.

Existing installations must apply all D1 migrations before deploying the new build. Keep the Gmail encryption key stable. Refresh the app after saving any open edits to load the updated report layout.

### Release checks and limits

The calculation, persistence, OAuth and delivery test suite passed 45 tests; the latest PDF layout also passed the PDF test, TypeScript check, production build and a rendered sample review.

Google production publishing/verification and Shopify App Store review remain outstanding for public hosted distribution. The source release is available for independent installation. Live Gmail delivery has not yet been verified. Hosting and provider usage limits are separate from the free software license.
