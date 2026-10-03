import { Hono } from "hono";
import { eventRoutes, type EventDeps } from "./routes/events.ts";
import { healthRoutes } from "./routes/health.ts";

// Without a database, only the health route is served
export function createApp(deps?: EventDeps): Hono {
    const app = new Hono().route("/", healthRoutes("webhook"));
    return deps === undefined ? app : app.route("/", eventRoutes(deps));
}
