import type { MessageEvent } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUN, handoff, item, memory, message, modelCall, started } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { runAgentEvents } from "./run-events.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const at = (time: string) => new Date(`2026-10-03T${time}.000Z`);

describe("runAgentEvents", () => {
    it("reads a run's messages, handoffs and memory events in time order", async () => {
        const projectId = await createProject(test.db, "Acme");
        const unknown: MessageEvent = {
            ...(message("2026-10-03T12:00:07.000Z") as MessageEvent),
            from: "unknown",
            parentStepId: undefined,
            labelRef: undefined,
            verified: false,
        };
        const batch = [
            item(started()),
            item(modelCall()),
            item(unknown),
            item(memory()),
            item(handoff("tool")),
            item(message()),
        ];
        await ingestBatch(test.db, projectId, batch);

        const ids = batch.map((entry) => entry.id);
        expect(await runAgentEvents(test.db, projectId, RUN)).toEqual([
            {
                eventId: ids[5],
                stepId: "5".repeat(16),
                agent: "billing",
                at: at("12:00:04"),
                type: "message",
                from: "orchestrator",
                parentStepId: "2".repeat(16),
                labelRef: "a".repeat(16),
                verified: true,
                trust: "untrusted",
                sensitivity: "public",
            },
            {
                eventId: ids[4],
                stepId: "6".repeat(16),
                agent: "billing",
                at: at("12:00:05"),
                type: "handoff",
                to: "refunds",
                via: "tool",
                trust: "trusted",
                sensitivity: "internal",
            },
            {
                eventId: ids[3],
                stepId: "7".repeat(16),
                agent: "billing",
                at: at("12:00:06"),
                type: "memory",
                store: "notes",
                op: "read",
                items: 2,
                verified: 1,
                trust: "untrusted",
                sensitivity: "internal",
            },
            expect.objectContaining({
                eventId: ids[2],
                type: "message",
                from: "unknown",
                parentStepId: null,
                labelRef: null,
                verified: false,
            }),
        ]);
    });

    it("reads nothing from another project or run", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, other, [item(started()), item(message())]);

        expect(await runAgentEvents(test.db, projectId, RUN)).toEqual([]);
        expect(await runAgentEvents(test.db, other, "9".repeat(32))).toEqual([]);
    });
});
