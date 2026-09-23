import { build } from "esbuild";
await build({
  entryPoints: ["app/lib/gmail.server.ts"],
  outfile: "tests/.generated/gmail.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-database",
      setup(b) {
        b.onResolve({ filter: /db\.server$/ }, () => ({
          path: "db",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export default globalThis.__gmailTestDb;",
        }));
      },
    },
  ],
});
await build({
  entryPoints: ["app/lib/email.server.ts"],
  outfile: "tests/.generated/email.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-database",
      setup(b) {
        b.onResolve({ filter: /db\.server$/ }, () => ({
          path: "db",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export default globalThis.__ledgerTestDb;",
        }));
      },
    },
  ],
});
