# Contributing

Open a GitHub issue describing the behavior you need or the bug you can reproduce. For changes, fork the repository and submit a pull request explaining the behavior and relevant checks.

Use Node.js 22.13 or later. See [installation](docs/INSTALLATION.md) for Cloudflare development setup.

```sh
npm ci
npm run setup
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

Add focused tests when changing calculations, shop isolation, sync, or delivery behavior. Keep monetary calculations in integer minor units. Preserve artist/shop isolation and frozen sent statements.

Keep credentials, real artist emails, sales data, and database backups out of commits and issues. Use synthetic data in reproductions. Contributions are provided under the repository's MIT license.
