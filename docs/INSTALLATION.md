# Install Artist Ledger

Artist Ledger runs inside Shopify Admin. Its server and PostgreSQL database run on your hosting account. The MIT-licensed source is free to use and modify; Shopify, hosting, database, domain, and email-provider charges are separate.

This guide uses Render for hosting and Resend for email. You can use another HTTPS host that runs Docker and connects to PostgreSQL. Allow time to create accounts and verify your sending domain.

## 1. Get the code and tools

Open [the GitHub repository](https://github.com/koan-shdw/artist-ledger). Click **Fork** if you want your own copy for changes and hosting. Install [Node.js 22.13 or later](https://nodejs.org/), [Git](https://git-scm.com/downloads), and the Shopify CLI:

```sh
npm install -g @shopify/cli@latest
git clone https://github.com/koan-shdw/artist-ledger.git
cd artist-ledger
npm ci
```

If you forked it, substitute your fork's clone URL. Keep the terminal in this folder for subsequent commands. GitHub's **Code → Download ZIP** is another way to get the source; extract it and open a terminal in the extracted folder.

## 2. Register your Shopify app

1. Sign in to the [Shopify Dev Dashboard](https://dev.shopify.com/) with an account that can develop apps for your store.
2. Select **Apps → Create app → Start from Dev Dashboard** and name it **Artist Ledger**.
3. Open the app's **Settings** and save its **Client ID** and **Client secret** in your password manager. They become `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` below.
4. Keep this app registration open. You will release its URLs and permissions after hosting is ready.

The code handles Shopify authentication. You do not need to copy a store access token into it. Shopify documents [app registration and credentials](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard).

## 3. Create the database

In [Render](https://dashboard.render.com/), select **New → Postgres**. Name it `artist-ledger-db`, choose PostgreSQL 17, and select a region. Choose a plan with persistence and backups appropriate for your live records. Copy the **Internal Database URL** for the app server; it contains credentials and must stay private. Put the web service in the same region. See [Render's database setup](https://render.com/docs/postgresql-creating-connecting).

## 4. Set up the sender

1. Create a [Resend account](https://resend.com/).
2. Add a domain you own and add the DNS records Resend provides at your domain provider.
3. Wait until Resend shows the domain as verified.
4. Create an API key with permission to send email.
5. Choose a sender such as `Your Gallery <statements@your-domain.com>`.

Use this as `EMAIL_FROM`. Resend requires a [verified domain](https://resend.com/docs/dashboard/domains/introduction) for your sender. The gallery's reply-to address is entered separately inside Artist Ledger.

## 5. Host the app server

1. In Render select **New → Web Service** and connect your GitHub copy of Artist Ledger.
2. Set **Language** to **Docker**, use the repository root, and choose the database's region. The included Dockerfile supplies the build and start commands.
3. Choose your service name and note its assigned HTTPS address. Use that exact address for `SHOPIFY_APP_URL`, with no trailing slash. If Render assigns the final address after creation, update this variable and redeploy once it is available.
4. Add the following variables in Render's **Environment** settings. Enter actual values privately in the host; never commit a filled `.env` file or paste secrets into a GitHub issue.

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | Shopify app Client ID |
| `SHOPIFY_API_SECRET` | Shopify app Client secret |
| `SHOPIFY_APP_URL` | Your web service's HTTPS address |
| `DATABASE_URL` | Render's Internal Database URL |
| `SCOPES` | `read_products,read_inventory,read_orders` |
| `RESEND_API_KEY` | Resend sending API key |
| `EMAIL_FROM` | Your verified sender, e.g. `Your Gallery <statements@your-domain.com>` |
| `CRON_SECRET` | A random secret of at least 32 characters |
| `PORT` | `3000` |

Generate `CRON_SECRET` locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

5. Click **Deploy**. Startup runs the included database migration and starts the server. Check the deployment logs for successful startup. Opening the HTTPS address should show the Artist Ledger Shopify login page.

Render describes [deploying the included Dockerfile](https://render.com/docs/docker). The running server and database must remain available for app access, webhooks, and scheduled reports.

## 6. Configure and release the Shopify app

On your computer, open `shopify.app.toml` in a text editor:

1. Set `client_id` to the Client ID from step 2. This ID is public; the Client secret belongs only in environment settings.
2. Replace every `https://your-app.example.com` with your exact HTTPS service address. This updates the app URL and both authentication callback URLs.
3. Preserve `embedded = true`, the three required scopes, and all webhook entries.
4. For your first installation, set `optional_scopes = []` until Shopify has approved historical order access for your app. Step 9 explains enabling it later.

Run:

```sh
shopify app deploy
```

Sign in to the correct Shopify organization and verify the displayed app before confirming the release. The configured Client ID identifies the app; there is no need to run `config link`. That command can replace the supplied configuration, so preserve this file's required scopes and webhooks if you choose to use it.

This command releases Shopify configuration. Your server is hosted separately in step 5. See [Shopify's deploy command](https://shopify.dev/docs/api/shopify-cli/app/app-deploy). If you forked the repo, save your configuration changes in your fork; it is safe to commit the public Client ID and URLs.

## 7. Install in your store

For a single gallery's live installation, open the registered app's **Distribution** section in the Dev Dashboard, choose **Custom distribution**, and generate an installation link for your store. Enter the store's admin domain or confirmed `.myshopify.com` domain as requested. Open the generated link while signed in as a store owner or staff member with permission to install apps, and approve installation.

Open **Shopify Admin → Apps → Artist Ledger**. It should load inside Shopify Admin. Pin it in the app navigation if desired.

Choose the distribution method for this registration deliberately: custom distribution supports one store or stores in the same Shopify Plus organization. A centrally hosted app serving unrelated stores needs public distribution and Shopify review. The distribution method cannot later be changed. Other galleries can independently register and host their own copy from this free source. See [Shopify's distribution rules](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method).

## 8. Prepare and send your first statement

1. In **Settings**, enter the gallery details and reply-to email. Choose the calculation basis. The default deducts product costs, then applies the gallery percentage to the positive remainder.
2. In **Artists**, add each artist's name, email, and gallery percentage. Select the artists who should receive reports and save.
3. Choose the **Report month** and year, then click **Sync Shopify sales**.
4. Assign products to their artists, verify or enter unit costs, choose included products, and save.
5. Open each artist's statement and check the included sale items, costs, gallery share, and amount to invoice. Exclude any items that should not appear and save.
6. Click **Review & send to artist** for one artist, or **Review & send** for the selected group. Verify the month, recipients, and amounts before sending.
7. Check the report status and Resend delivery logs. Provider acceptance alone does not confirm inbox delivery.

Do the first delivery check on a development store using an email address you control. A sent artist/month statement is frozen and skipped on later sends; this version has no corrected-statement workflow.

## 9. Enable older months

Shopify normally limits order access to the last 60 days. For older months:

1. Request `read_all_orders` access for the app through the Dev Dashboard and wait for Shopify approval.
2. Change the configuration to `optional_scopes = ["read_all_orders"]` and run `shopify app deploy` again.
3. In Artist Ledger **Settings**, click **Enable historical-order access** and grant permission.
4. Choose the past month and year, sync, verify costs and included items, then review and send.

The app blocks older-month sync without that permission. Imported costs initially reflect current Shopify unit costs; correct them to the applicable historical costs before sending. See [Shopify order permissions](https://shopify.dev/docs/api/usage/access-scopes#orders-permissions).

## 10. Optional automatic monthly reports

After manual sending is verified, enable automatic reporting in the app's Settings. Configure an external scheduler to send this request on the first of each month at 12:00 UTC:

```http
POST https://YOUR-APP-HOST/jobs/monthly
Authorization: Bearer YOUR_CRON_SECRET
```

Keep the secret in the scheduler's secret store. The job syncs the previous calendar month and sends eligible reports to selected artists, using the saved item assignments, costs, and percentages. It does not wait for a monthly human review. Leave automatic reporting disabled if you want to review every statement first.

Inspect the latest job result in Settings. Each shop/month job runs once; failed or interrupted runs require review and manual completion. Hosting the code alone does not create a scheduler.

## Local development

Use a separate Shopify app registration and development store. Copy `.env.example` to `.env`, set a local PostgreSQL `DATABASE_URL`, and supply your development app credentials. Set the development Client ID in `shopify.app.toml`, keeping scopes and webhooks intact. Run `npm run setup`, then `shopify app dev`. Follow the CLI's development-store installation link. Use a separate checkout/configuration for production so development URLs cannot replace production settings.

For Docker Compose, set `POSTGRES_PASSWORD` in the local `.env` as well as the app variables, then run `docker compose up --build`. The included compose file keeps PostgreSQL on its internal network and exposes the app at port 3000. Use a URL-safe random database password. Local Docker still needs an HTTPS tunnel or proxy for Shopify access.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App loads outside Admin or authentication repeats | Matching Client ID/secret, HTTPS app URL and callback URLs; reopen through Shopify Apps |
| Server does not start | Database URL, service region/network, migration and startup logs |
| Historical sync is blocked | Shopify approval, released optional scope, merchant permission |
| Send button is blocked | Saved changes, valid artist email, assigned items, known costs, no negative balance or unallocated refunds |
| Email is not received | Verified sender, API key, Resend delivery logs and recipient spam folder |
| A previously sent month cannot be resent | Sent statements are immutable; reconcile outside the app if a correction is needed |

Back up the database and export required statements before uninstalling. Uninstall removes that store's app data and sessions. See the README for calculation rules and reporting limitations.
