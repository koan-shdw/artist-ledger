interface WorkerEnv {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  CRON_SECRET: string;
}
declare namespace Cloudflare {
  interface Env extends WorkerEnv {}
}
declare module "virtual:react-router/server-build" {
  const build: import("react-router").ServerBuild;
  export = build;
}

type Env = WorkerEnv;
