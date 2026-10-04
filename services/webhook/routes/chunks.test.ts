import { chunkQueue, createAgentKey, createProject } from "@quard/db";
import { projectKeys } from "@quard/db/server";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { parseHashKey } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";

const RUN = "4".repeat(32);
const AT = "2026-10-03T12:00:00.000Z";

let test: TestDb;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, keys: projectKeys(parseHashKey("ab".repeat(32))) });
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// A chunk of an outside email that Jev labeled, sent without the SDK's redaction
const chunk = (label: string, text: string) => ({
    type: "chunk_label",
    runId: RUN,
    stepId: "5".repeat(16),
    agent: "billing",
    at: AT,
    tool: "readInbox",
    origin: "email:billing@acme-billing.net",
    detector: "jev-1.13.0",
    chunk: 0,
    text,
    label,
    probabilities: { [label]: 0.55 },
    score: 0,
});

describe("POST /v1/events with labeled chunks", () => {
    it("stores each chunk masked for the review queue, and queues none for the AI fallback", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { key } = await createAgentKey(test.db, projectId, "billing");
        const events = [
            { type: "run_started", runId: RUN, agent: "billing", at: AT, origins: {} },
            chunk("none", "Write to jane@acme.com about DE89370400440532013000."),
        ].map((event, n) => ({ id: String(n + 1).padStart(16, "c"), event }));

        const res = await app.request("/v1/events", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ events }),
        });

        expect(res.status).toBe(202);
        const [stored] = await chunkQueue(test.db, projectId);
        expect(stored).toMatchObject({
            // The sender's address is masked like any other email
            origin: "email:b…@acme-billing.net",
            label: "none",
            fallback: { state: "pending" },
        });
        expect(stored?.text).not.toContain("jane@");
        expect(stored?.text).not.toContain("0532013000");
    });
});
