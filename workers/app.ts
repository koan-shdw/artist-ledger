import { createRequestHandler } from "react-router";
const handle = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, { cloudflare: { env, ctx } });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const { monthlyTick } = await import("../app/lib/monthly.server");
    await monthlyTick();
  },
} satisfies ExportedHandler<Env>;
