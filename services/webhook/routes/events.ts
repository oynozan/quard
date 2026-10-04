import { ingestBatch, type Db } from "@quard/db";
import { MAX_BATCH_BYTES, redactEvent, uploadBatch, type Redactor } from "@quard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { issuesOf, projectFor, readJson } from "../http/request.ts";

export type EventDeps = { db: Db; redactor: Redactor };

// The SDK keeps each batch's events under MAX_BATCH_BYTES; the rest is
// room for the envelope
const MAX_BODY = MAX_BATCH_BYTES + 1024 * 1024;

// Events from the SDK, in batches. Agent keys only.
export function eventRoutes(deps: EventDeps): Hono {
    return new Hono().post(
        "/v1/events",
        bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: "batch_too_large" }, 413) }),
        async (c) => {
            const projectId = await projectFor(deps.db, c.req.header("authorization"));
            if (projectId === undefined) {
                return c.json({ error: "invalid_agent_key" }, 401);
            }
            const batch = uploadBatch.safeParse(await readJson(c.req.raw));
            if (!batch.success) {
                return c.json({ error: "invalid_batch", issues: issuesOf(batch.error) }, 400);
            }
            if (batch.data.dropped !== undefined) {
                console.warn(
                    `webhook: an SDK in project ${projectId} dropped ${batch.data.dropped} events ` +
                        "(a full buffer, or values that could not be sent as JSON)",
                );
            }
            // Config errors belong to no run; they are logged until the dashboard shows them
            for (const { event } of batch.data.events) {
                if (event.type === "config_error") {
                    console.warn(`webhook: project ${projectId}: the ${event.source} file failed to load`);
                }
            }
            // Redacted again here, so an old or broken SDK never stores a raw value
            const items = batch.data.events.map((item) => ({ ...item, event: redactEvent(deps.redactor, item.event) }));
            const stored = await ingestBatch(deps.db, projectId, items);
            return c.json({ received: items.length, stored }, 202);
        },
    );
}
