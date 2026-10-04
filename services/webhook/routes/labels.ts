import { storeLabelRecords } from "@quard/db";
import { LABELS_PATH, labelUpload, redactRecord } from "@quard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { WebhookDeps } from "../http/deps.ts";
import { issuesOf, projectFor, readJson } from "../http/request.ts";

// Label records are small, so an upload fits well inside this
const MAX_BODY = 1024 * 1024;

// Label records another process may read right away. Answers only once
// they are stored. Agent keys only.
export function labelRoutes(deps: WebhookDeps): Hono {
    return new Hono().post(
        LABELS_PATH,
        bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: "labels_too_large" }, 413) }),
        async (c) => {
            const projectId = await projectFor(deps.db, c.req.header("authorization"));
            if (projectId === undefined) {
                return c.json({ error: "invalid_agent_key" }, 401);
            }
            const upload = labelUpload.safeParse(await readJson(c.req.raw));
            if (!upload.success) {
                return c.json({ error: "invalid_labels", issues: issuesOf(upload.error) }, 400);
            }
            // Redacted again with the project's key, so an old or broken SDK never stores a raw value
            const redactor = deps.keys.redactor(projectId);
            const records = upload.data.records.map((record) => redactRecord(record, redactor));
            const stored = await storeLabelRecords(deps.db, projectId, records);
            return c.json({ stored }, 201);
        },
    );
}
