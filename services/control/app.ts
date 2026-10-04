import { Hono } from "hono";
import { healthRoutes } from "./routes/health.ts";
import type { Context } from "./server/context.ts";

export function createApp(ctx: Pick<Context, "db" | "log">): Hono {
    return new Hono().route("/", healthRoutes(ctx, "control"));
}
