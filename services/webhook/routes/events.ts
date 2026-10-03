import { ingestBatch, projectForKey, type Db } from "@quard/db";
import { MAX_BATCH_BYTES, redactEvent, uploadBatch, type Redactor } from "@quard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

export type EventDeps = { db: Db; redactor: Redactor };

// The SDK keeps each batch's events under MAX_BATCH_BYTES; the rest is
// room for the envelope
const MAX_BODY = MAX_BATCH_BYTES + 1024 * 1024;

function bearer(header: string | undefined): string | undefined {
    return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}

async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}

// Events from the SDK, in batches. Agent keys only.
export function eventRoutes(deps: EventDeps): Hono {
    return new Hono().post(
        "/v1/events",
        bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: "batch_too_large" }, 413) }),
        async (c) => {
            const key = bearer(c.req.header("authorization"));
            const projectId = key === undefined ? undefined : await projectForKey(deps.db, key);
            if (projectId === undefined) {
                return c.json({ error: "invalid_agent_key" }, 401);
            }
            const batch = uploadBatch.safeParse(await readJson(c.req.raw));
            if (!batch.success) {
                const issues = batch.error.issues
                    .slice(0, 5)
                    .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`);
                return c.json({ error: "invalid_batch", issues }, 400);
            }
            if (batch.data.dropped !== undefined) {
                console.warn(
                    `webhook: an SDK in project ${projectId} dropped ${batch.data.dropped} events from a full buffer`,
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
