import { Hono } from "hono";
import type { WebhookDeps } from "./http/deps.ts";
import { eventRoutes } from "./routes/events.ts";
import { hashKeyRoutes } from "./routes/hash-key.ts";
import { healthRoutes } from "./routes/health.ts";
import { labelRoutes } from "./routes/labels.ts";

// Without a database, only the health route is served
export function createApp(deps?: WebhookDeps): Hono {
    const app = new Hono().route("/", healthRoutes("webhook"));
    if (deps === undefined) {
        return app;
    }
    return app.route("/", eventRoutes(deps)).route("/", labelRoutes(deps)).route("/", hashKeyRoutes(deps));
}
