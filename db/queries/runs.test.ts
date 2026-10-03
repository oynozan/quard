import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunItem } from "./ingest/rows.ts";
import { content, decision, item, modelCall, RUN, started, toolCall } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject } from "./projects.ts";
import { ingestBatch } from "./ingest/store.ts";
import { listRuns } from "./runs.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const startedAt = (runId: string, at: string): RunItem["event"] => ({
    type: "run_started",
    runId,
    agent: "billing",
    at,
    origins: {},
});

describe("listRuns", () => {
    it("lists the newest runs first and pages back by start time", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(startedAt("a".repeat(32), "2026-10-03T10:00:00.000Z")),
            item(startedAt("b".repeat(32), "2026-10-03T11:00:00.000Z")),
            item(startedAt("c".repeat(32), "2026-10-03T12:00:00.000Z")),
        ]);

        const all = await listRuns(test.db, projectId);
        expect(all.map((run) => run.runId)).toEqual(["c".repeat(32), "b".repeat(32), "a".repeat(32)]);
        expect(all[0]).toMatchObject({ agent: "billing", modelCalls: 0, blocked: 0, influenced: false });

        const page = await listRuns(test.db, projectId, { limit: 1, before: new Date("2026-10-03T12:00:00.000Z") });
        expect(page.map((run) => run.runId)).toEqual(["b".repeat(32)]);
    });
});

describe("listRuns details", () => {
    it("adds agents in first-seen order, tools, guard counts and the last step", async () => {
        const projectId = await createProject(test.db, "Acme");
        const child = { ...modelCall("2026-10-03T12:00:01.500Z"), agent: "researcher", stepId: "5".repeat(16) };
        const permission = { ...decision(), guard: "permission", rule: "permission", decision: "allow" as const };
        const refused = { ...permission, decision: "block" as const, reason: "permission_denied" };
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(modelCall()),
            item(child),
            item(content()),
            item(decision()),
            item(permission),
            item(refused),
            item({ ...decision("2026-10-03T12:00:02.500Z"), decision: "ask" }),
            item({ ...decision("2026-10-03T12:00:02.600Z"), decision: "block", enforced: false, mode: "observe" }),
            item(toolCall()),
        ]);

        const [run] = await listRuns(test.db, projectId);

        expect(run?.runId).toBe(RUN);
        expect(run?.agents).toEqual(["billing", "researcher"]);
        expect(run?.tools).toEqual(["payInvoice"]);
        expect(run?.decisions).toEqual({ allowed: 1, asked: 1, blocked: 2 });
        expect(run?.lastStep).toEqual({ kind: "tool_call", status: "blocked" });
    });

    it("has no last step for a run without calls", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started())]);

        expect((await listRuns(test.db, projectId))[0]?.lastStep).toBeNull();
    });
});
