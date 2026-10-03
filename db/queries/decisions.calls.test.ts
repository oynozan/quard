import type { DecisionEvent, ToolCallEvent } from "@quard/shared";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunItem } from "./ingest/rows.ts";
import { decision, item, modelCall, RUN, STEP } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { blockRateDays, toolCoverage } from "./decisions.ts";
import { ingestBatch } from "./ingest/store.ts";
import { createProject } from "./projects.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    // A zone far from UTC, so time math that leans on it fails here
    await sql`SET TIME ZONE 'Asia/Tokyo'`.execute(test.db);
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const OTHER_RUN = "a".repeat(32);

const stepId = (n: number) => n.toString(16).padStart(16, "0");

const call = (n: number, at: string, status: ToolCallEvent["status"] = "ok", tool = "payInvoice"): RunItem =>
    item({
        type: "tool_call",
        runId: RUN,
        stepId: stepId(n),
        agent: "billing",
        at,
        tool,
        arguments: {},
        status,
        influenced: false,
        flagged: false,
        durationMs: 3,
    });

// A decision on step n, an enforced action block unless fields say otherwise
const ruling = (n: number, at: string, fields: Partial<DecisionEvent> = {}): RunItem =>
    item({ ...decision(at), stepId: stepId(n), ...fields });

describe("blockRateDays", () => {
    const days = { since: new Date("2026-10-01T00:00:00.000Z"), until: new Date("2026-10-04T00:00:00.000Z") };

    it("is empty for a project with no calls", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await blockRateDays(test.db, projectId, days)).toEqual([]);
    });

    it("counts guarded calls and blocked calls per UTC day", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            call(1, "2026-09-30T23:59:59.999Z", "blocked"),
            call(2, "2026-10-01T00:00:00.000Z"),
            call(3, "2026-10-01T23:30:00.000Z", "blocked"),
            // The tool ran and a guard withheld its output
            call(4, "2026-10-02T00:30:00.000Z"),
            ruling(4, "2026-10-02T00:30:00.000Z"),
            call(5, "2026-10-02T10:00:00.000Z"),
            ruling(5, "2026-10-02T10:00:00.000Z", { mode: "observe", enforced: false }),
            call(6, "2026-10-02T11:00:00.000Z"),
            ruling(6, "2026-10-02T11:00:00.000Z", { guard: "approval", rule: "approval", decision: "ask" }),
            item({ ...modelCall("2026-10-02T11:30:00.000Z"), stepId: stepId(7) }),
            ruling(7, "2026-10-02T11:30:00.000Z", { guard: "permission", rule: "requested-call" }),
            call(8, "2026-10-02T12:00:00.000Z"),
            ruling(8, "2026-10-02T12:00:00.000Z", { runId: OTHER_RUN }),
            call(9, "2026-10-03T23:59:59.999Z", "error"),
            call(10, "2026-10-04T00:00:00.000Z", "blocked"),
        ]);
        await ingestBatch(test.db, other, [call(2, "2026-10-01T00:00:00.000Z"), ruling(2, "2026-10-01T00:00:00.000Z")]);

        expect(await blockRateDays(test.db, projectId, days)).toEqual([
            { day: 0, calls: 2, blocked: 1 },
            { day: 1, calls: 4, blocked: 1 },
            { day: 2, calls: 1, blocked: 0 },
        ]);
    });
});

describe("toolCoverage", () => {
    const range = { since: new Date("2026-10-03T12:00:00.000Z"), until: new Date("2026-10-03T12:10:00.000Z") };

    const requested = (tool: string, at: string, verdict: "allow" | "block" = "allow"): RunItem =>
        item({ ...decision(at), guard: "permission", rule: "requested-call", decision: verdict, stepId: STEP, tool });

    const warn = (at: string, code: string, tool?: string): RunItem =>
        item({ type: "warning", runId: RUN, stepId: STEP, agent: "billing", at, code, ...(tool ? { tool } : {}) });

    it("is zero for a project with no tools", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await toolCoverage(test.db, projectId, range)).toEqual({ seen: 0, guarded: 0 });
    });

    it("counts the tools seen and the ones with no unwrapped warning", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            requested("oldTool", "2026-10-03T11:59:59.999Z"),
            warn("2026-10-03T11:59:59.999Z", "unwrapped_tool", "lookup"),
            requested("lookup", "2026-10-03T12:00:00.000Z"),
            call(1, "2026-10-03T12:00:00.000Z", "ok", "refund"),
            warn("2026-10-03T12:00:00.000Z", "unwrapped_tool", "deleteFiles"),
            requested("deleteFiles", "2026-10-03T12:01:00.000Z", "block"),
            requested("payInvoice", "2026-10-03T12:01:00.000Z"),
            call(2, "2026-10-03T12:02:00.000Z"),
            // Only the warning reached the backend
            warn("2026-10-03T12:03:00.000Z", "unwrapped_tool", "exportAll"),
            warn("2026-10-03T12:03:30.000Z", "unwrapped_tool"),
            item({ ...decision("2026-10-03T12:05:00.000Z"), tool: "wire" }),
            warn("2026-10-03T12:06:00.000Z", "detector_error", "lookup"),
            requested("later", "2026-10-03T12:10:00.000Z"),
            call(3, "2026-10-03T12:10:00.000Z", "ok", "late"),
            warn("2026-10-03T12:10:00.000Z", "unwrapped_tool", "payInvoice"),
        ]);
        await ingestBatch(test.db, other, [
            requested("otherTool", "2026-10-03T12:05:00.000Z"),
            warn("2026-10-03T12:05:00.000Z", "unwrapped_tool", "payInvoice"),
        ]);

        expect(await toolCoverage(test.db, projectId, range)).toEqual({ seen: 5, guarded: 3 });
    });
});
