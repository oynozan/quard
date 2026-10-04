import type { DecisionEvent } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOf } from "../../test/agents.ts";
import { decision, item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import type { RunItem } from "../ingest/rows.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { runLimitCounts } from "./run-limits.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const range = { since: new Date("2026-10-03T00:00:00.000Z"), until: new Date("2026-10-04T00:00:00.000Z") };

// A run limit decision of run n at a time of day
function over(n: number, time: string, rule: string, fields: Partial<DecisionEvent> = {}): RunItem {
    return item({
        ...decision(`2026-10-03T${time}.000Z`),
        runId: runOf(n),
        tool: "delegate",
        guard: "limit",
        rule,
        reason: "limit_reached",
        field: undefined,
        ...fields,
    });
}

const observed = { mode: "observe", enforced: false } as const;

describe("runLimitCounts", () => {
    it("is empty for a project where no run went over a limit", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await runLimitCounts(test.db, projectId, range)).toEqual([]);
    });

    it("counts runs per limit, observed apart from stopped, with the newest mode", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            // Run 1 went over depth twice while observed, run 2 once
            over(1, "10:00:00", "max-depth", observed),
            over(1, "10:00:01", "max-depth", observed),
            over(2, "11:00:00", "max-depth", observed),
            // Steps were observed, then switched on and stopped run 3
            over(2, "11:00:01", "max-steps", { ...observed, tool: "gpt-5.4-mini" }),
            over(3, "12:00:00", "max-steps", { tool: "gpt-5.4-mini" }),
            over(3, "12:00:00", "max-cost", { tool: "gpt-5.4-mini" }),
            // Left out: an allow, another limit rule and times outside the range
            over(4, "12:00:00", "max-loops", { decision: "allow" }),
            over(4, "12:00:00", "max-calls-per-run"),
            item({ ...decision("2026-10-02T23:59:59.000Z"), runId: runOf(5), guard: "limit", rule: "max-loops" }),
            item({ ...decision("2026-10-04T00:00:00.000Z"), runId: runOf(5), guard: "limit", rule: "max-loops" }),
        ]);

        const rows = await runLimitCounts(test.db, projectId, range);
        expect(rows.sort((a, b) => a.rule.localeCompare(b.rule))).toEqual([
            { rule: "max-cost", mode: "block", wouldStop: 0, stopped: 1 },
            { rule: "max-depth", mode: "observe", wouldStop: 2, stopped: 0 },
            { rule: "max-steps", mode: "block", wouldStop: 1, stopped: 1 },
        ]);
    });
});
