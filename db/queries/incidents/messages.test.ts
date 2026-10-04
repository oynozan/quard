import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item, RUN, started } from "../../test/events.ts";
import { insertMessages } from "../../test/messages.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { getAgentMessages } from "./messages.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("getAgentMessages", () => {
    it("returns a run's messages and handoffs oldest first", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started())]);
        const at = (s: number) => `2026-10-03T12:00:0${s}.000Z`;
        await insertMessages(test.db, projectId, [
            { runId: RUN, stepId: "b".repeat(16), kind: "message", from: "billing", to: "triage", at: at(5) },
            {
                runId: RUN,
                stepId: "a".repeat(16),
                kind: "handoff",
                from: "triage",
                to: "billing",
                at: at(1),
                parentStepId: "c".repeat(16),
                trust: "untrusted",
                verified: false,
            },
        ]);

        expect(await getAgentMessages(test.db, projectId, RUN)).toEqual([
            {
                stepId: "a".repeat(16),
                kind: "handoff",
                from: "triage",
                to: "billing",
                parentStepId: "c".repeat(16),
                trust: "untrusted",
                sensitivity: "internal",
                verified: false,
                at: new Date(at(1)),
            },
            {
                stepId: "b".repeat(16),
                kind: "message",
                from: "billing",
                to: "triage",
                parentStepId: null,
                trust: "trusted",
                sensitivity: "internal",
                verified: true,
                at: new Date(at(5)),
            },
        ]);

        const other = await createProject(test.db, "Other");
        expect(await getAgentMessages(test.db, other, RUN)).toEqual([]);
        expect(await getAgentMessages(test.db, projectId, "4".repeat(32))).toEqual([]);
    });
});
