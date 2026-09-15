import { env } from "cloudflare:workers";
import { createDatabase } from "./lib/d1.server";
export default createDatabase(() => (env as unknown as { DB: D1Database }).DB);
