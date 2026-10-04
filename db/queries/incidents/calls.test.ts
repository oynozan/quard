import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item, modelCall, RUN, started, toolCall } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { getModelCalls } from "./calls.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("getModelCalls", () => {
    it("returns a run's model calls oldest first, with the recorded request", async () => {
        const projectId = await createProject(test.db, "Acme");
        const requestBody = { model: "gpt-5.4-mini", input: [{ role: "user", content: "Pay the invoice" }] };
        const later = {
            ...modelCall("2026-10-03T12:00:04.000Z"),
            stepId: "5".repeat(16),
            requestBody,
            outputText: ["Paying the invoice now."],
        };
        const first = { ...modelCall(), responseId: undefined, toolCalls: [] };
        await ingestBatch(test.db, projectId, [item(started()), item(later), item(first), item(toolCall())]);

        const calls = await getModelCalls(test.db, projectId, RUN);

        expect(calls).toEqual([
            {
                stepId: "2".repeat(16),
                model: "gpt-5.4-mini",
                responseId: null,
                toolCalls: [],
                requestBody: null,
                outputText: [],
                at: new Date("2026-10-03T12:00:01.000Z"),
            },
            {
                stepId: "5".repeat(16),
                model: "gpt-5.4-mini",
                responseId: "resp_1",
                toolCalls: [{ callId: "call_1", name: "payInvoice", arguments: '{"iban":"DE89…3000"}' }],
                requestBody,
                outputText: ["Paying the invoice now."],
                at: new Date("2026-10-03T12:00:04.000Z"),
            },
        ]);
    });

    it("finds nothing for another project or run", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started()), item(modelCall())]);

        const other = await createProject(test.db, "Other");
        expect(await getModelCalls(test.db, other, RUN)).toEqual([]);
        expect(await getModelCalls(test.db, projectId, "4".repeat(32))).toEqual([]);
    });
});
