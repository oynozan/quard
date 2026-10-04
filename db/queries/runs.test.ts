import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../connect/connect.ts";
import type { RunItem } from "./ingest/rows.ts";
import { content, decision, item, modelCall, RUN, started, toolCall } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject } from "./projects.ts";
import { ingestBatch } from "./ingest/store.ts";
import { getRun, listRuns } from "./runs.ts";

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

    it("shows x402 spend next to the cost", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started())]);
        expect((await listRuns(test.db, projectId))[0]).toMatchObject({ spendUsd: 0, spendKnown: true });

        await test.db
            .updateTable("runs")
            .set({ spend_usd: 1.5, spend_known: false })
            .where("project_id", "=", projectId)
            .execute();

        expect((await listRuns(test.db, projectId))[0]).toMatchObject({ spendUsd: 1.5, spendKnown: false });
        expect(await getRun(test.db, projectId, RUN)).toMatchObject({ spendUsd: 1.5, spendKnown: false });
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

describe("listRuns by id", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((char) => char.repeat(32)) as [string, string, string, string];

    it("lists only the given runs of the project, newest first", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            item(startedAt(a, "2026-10-03T10:00:00.000Z")),
            item(startedAt(b, "2026-10-03T11:00:00.000Z")),
            item(startedAt(c, "2026-10-03T12:00:00.000Z")),
        ]);
        await ingestBatch(test.db, other, [item(startedAt(d, "2026-10-03T13:00:00.000Z"))]);

        const rows = await listRuns(test.db, projectId, { runIds: [a, c, d, "e".repeat(32)] });
        expect(rows.map((run) => run.runId)).toEqual([c, a]);

        const page = await listRuns(test.db, projectId, { runIds: [a, b, c], limit: 2 });
        expect(page.map((run) => run.runId)).toEqual([c, b]);
    });

    it("lists nothing for no ids, without reading the database", async () => {
        expect(await listRuns({} as Db, "project", { runIds: [] })).toEqual([]);
    });

    it("keeps every given run past the default limit", async () => {
        const projectId = await createProject(test.db, "Acme");
        const ids = Array.from({ length: 51 }, (_, n) => n.toString(16).padStart(32, "0"));
        await ingestBatch(
            test.db,
            projectId,
            ids.map((id, n) => item(startedAt(id, new Date(Date.UTC(2026, 9, 3, 10, n)).toISOString()))),
        );

        expect(await listRuns(test.db, projectId)).toHaveLength(50);
        expect(await listRuns(test.db, projectId, { runIds: ids })).toHaveLength(51);
    });
});

describe("getRun", () => {
    it("has no run for an unknown id or another project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, other, [item(started())]);

        expect(await getRun(test.db, projectId, RUN)).toBeUndefined();
        expect(await getRun(test.db, other, "f".repeat(32))).toBeUndefined();
    });

    it("adds each decision's late flag, detector score and policy version from its event", async () => {
        const projectId = await createProject(test.db, "Acme");
        const detector = {
            ...decision("2026-10-03T12:00:02.500Z"),
            guard: "source",
            rule: "detector:injection",
            decision: "flag" as const,
            score: 0.93,
            policy: "2026-10-01",
        };
        await ingestBatch(test.db, projectId, [item(started()), item(decision()), item(detector, true)]);

        const run = await getRun(test.db, projectId, RUN);

        const extras = run?.decisions.map(({ rule, degraded, score, policy }) => ({ rule, degraded, score, policy }));
        expect(extras).toEqual([
            { rule: "iban:from", degraded: false, score: null, policy: null },
            { rule: "detector:injection", degraded: true, score: 0.93, policy: "2026-10-01" },
        ]);
        expect(run?.decisions[0]).toMatchObject({ guard: "action", decision: "block", enforced: true });
    });

    it("keeps a decision whose event row is gone", async () => {
        const projectId = await createProject(test.db, "Acme");
        const gone = item({ ...decision(), score: 0.5, policy: "v1" }, true);
        await ingestBatch(test.db, projectId, [item(started()), gone]);
        await test.db
            .deleteFrom("events")
            .where("project_id", "=", projectId)
            .where("event_id", "=", gone.id)
            .execute();

        const run = await getRun(test.db, projectId, RUN);

        expect(run?.decisions).toMatchObject([{ eventId: gone.id, degraded: false, score: null, policy: null }]);
    });
});
