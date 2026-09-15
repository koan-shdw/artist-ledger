import { build } from "esbuild";
await build({
  entryPoints: ["app/lib/monthly.server.ts"],
  outfile: "tests/.generated/monthly.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-monthly",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "env",
          namespace: "mock",
        }));
        b.onResolve({ filter: /shopify.server$/ }, () => ({
          path: "shopify",
          namespace: "mock",
        }));
        b.onResolve({ filter: /sync-job.server$/ }, () => ({
          path: "sync",
          namespace: "mock",
        }));
        b.onResolve({ filter: /email.server$/ }, () => ({
          path: "email",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents:
            path === "env"
              ? "export const env=globalThis.__monthlyEnv;"
              : path === "shopify"
                ? "export const unauthenticated={admin:async()=>({admin:{}})};"
                : path === "sync"
                  ? "export const continueSync=(...args)=>globalThis.__monthlySync(...args);"
                  : "export const sendReports=(...args)=>globalThis.__monthlySend(...args);",
        }));
      },
    },
  ],
});
for (const [name, file] of Object.entries({
  d1: "app/lib/d1.server.ts",
  sessions: "app/lib/session-storage.server.ts",
  steps: "app/lib/sync-steps.server.ts",
})) {
  await build({
    entryPoints: [file],
    outfile: "tests/.generated/" + name + ".mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
}
await build({
  entryPoints: ["app/lib/sync-job.server.ts"],
  outfile: "tests/.generated/sync-job.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-bindings",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "env",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export const env=globalThis.__testEnv;",
        }));
      },
    },
  ],
});
await build({
  entryPoints: ["app/lib/statement-pdf.ts"],
  outfile: "tests/.generated/pdf.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
