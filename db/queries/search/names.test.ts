import type { ModelCallEvent, ToolCallEvent } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { findName } from "./names.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const run = (n: number) => n.toString(16).padStart(32, "0");
const step = (n: number) => n.toString(16).padStart(16, "0");
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds));

const model = (
    runId: string,
    stepId: string,
    seconds: number,
    agent: string,
    name = "gpt-5.4-mini",
): ModelCallEvent => ({
    type: "model_call",
    runId,
    stepId,
    agent,
    at: at(seconds).toISOString(),
    model: name,
    toolCalls: [],
    status: "ok",
    durationMs: 500,
});

const call = (runId: string, stepId: string, seconds: number, agent: string, tool: string): ToolCallEvent => ({
    type: "tool_call",
    runId,
    stepId,
    agent,
    at: at(seconds).toISOString(),
    tool,
    arguments: {},
    status: "ok",
    influenced: false,
    flagged: false,
    durationMs: 3,
    keys: [],
});

// Three runs: billing alone, researcher alone, then researcher handing off to billing
const fleet = async (projectId: string) => {
    await ingestBatch(
        test.db,
        projectId,
        [
            model(run(1), step(1), 1, "billing"),
            call(run(1), step(2), 2, "billing", "payInvoice"),
            call(run(1), step(3), 3, "billing", "payInvoice"),
            model(run(2), step(1), 10, "researcher", "payInvoice"),
            call(run(2), step(2), 11, "researcher", "searchWeb"),
            model(run(3), step(1), 20, "researcher"),
            call(run(3), step(2), 21, "billing", "PayInvoice"),
        ].map((event) => item(event)),
    );
};

describe("findName", () => {
    it("finds nothing in a new project", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await findName(test.db, projectId, { agent: "billing", limit: 50 })).toEqual({
            total: 0,
            runs: 0,
            matches: [],
        });
    });

    it("finds the first step of an agent in each run, newest run first, whatever the case", async () => {
        const projectId = await createProject(test.db, "Acme");
        await fleet(projectId);

        expect(await findName(test.db, projectId, { agent: "BILLING", limit: 50 })).toEqual({
            total: 2,
            runs: 2,
            matches: [
                { runId: run(3), stepId: step(2), agent: "billing", kind: "tool_call", name: "PayInvoice", at: at(21) },
                {
                    runId: run(1),
                    stepId: step(1),
                    agent: "billing",
                    kind: "model_call",
                    name: "gpt-5.4-mini",
                    at: at(1),
                },
            ],
        });
    });

    it("finds tool calls by tool name only, not models with that name", async () => {
        const projectId = await createProject(test.db, "Acme");
        await fleet(projectId);

        const found = await findName(test.db, projectId, { tool: "payinvoice", limit: 50 });

        expect(found).toMatchObject({ total: 2, runs: 2 });
        expect(found.matches.map(({ runId, stepId }) => [runId, stepId])).toEqual([
            [run(3), step(2)],
            [run(1), step(2)],
        ]);
    });

    it("matches both names when both are given", async () => {
        const projectId = await createProject(test.db, "Acme");
        await fleet(projectId);

        const found = await findName(test.db, projectId, { agent: "researcher", tool: "searchweb", limit: 50 });

        expect(found).toMatchObject({ total: 1, matches: [{ runId: run(2), stepId: step(2) }] });
        expect(await findName(test.db, projectId, { agent: "researcher", tool: "payInvoice", limit: 50 })).toEqual({
            total: 0,
            runs: 0,
            matches: [],
        });
    });

    it("lists the newest matches up to the limit, and counts them all", async () => {
        const projectId = await createProject(test.db, "Acme");
        await fleet(projectId);

        const found = await findName(test.db, projectId, { agent: "researcher", limit: 1 });

        expect(found.total).toBe(2);
        expect(found.matches).toMatchObject([{ runId: run(3), stepId: step(1) }]);
    });

    it("leaves out other projects", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await fleet(other);
        await ingestBatch(test.db, projectId, [item(model(run(1), step(1), 1, "support"))]);

        expect((await findName(test.db, projectId, { agent: "billing", limit: 50 })).total).toBe(0);
        expect((await findName(test.db, projectId, { agent: "support", limit: 50 })).total).toBe(1);
    });
});
