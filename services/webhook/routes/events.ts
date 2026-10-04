import { ingestBatch, recordConfigErrors, recordDropped } from "@quard/db";
import { MAX_BATCH_BYTES, redactEvent, uploadBatch } from "@quard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WebhookDeps } from "../http/deps.ts";
import { issuesOf, projectFor, readJson } from "../http/request.ts";

// The SDK keeps each batch's events under MAX_BATCH_BYTES; the rest is
// room for the envelope
const MAX_BODY = MAX_BATCH_BYTES + 1024 * 1024;

// Events from the SDK, in batches. Agent keys only.
export function eventRoutes(deps: WebhookDeps): Hono {
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
            // Redacted again with the project's key, so an old or broken SDK never stores a raw value
            const redactor = deps.keys.redactor(projectId);
            const items = batch.data.events.map((item) => ({ ...item, event: redactEvent(redactor, item.event) }));
            const stored = await ingestBatch(deps.db, projectId, items);
            // After the events, so a resend after a failed ingest counts these once.
            // The first event's id names the batch; the schema asks for one at least.
            const now = new Date();
            await recordDropped(deps.db, projectId, items[0]!.id, batch.data.dropped ?? 0, now);
            // Config errors belong to no run, so they are kept apart
            const errors = items.flatMap(({ event }) => (event.type === "config_error" ? [event] : []));
            for (const { source } of errors) {
                console.warn(`webhook: project ${projectId}: the ${source} file failed to load`);
            }
            await recordConfigErrors(deps.db, projectId, errors, now);
            return c.json({ received: items.length, stored }, 202);
        },
    );
}
