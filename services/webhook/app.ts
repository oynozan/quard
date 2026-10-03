import { Hono } from "hono";
import { healthRoutes } from "./routes/health.ts";

export function createApp(): Hono {
    return new Hono().route("/", healthRoutes("webhook"));
}
