import type { DecisionEvent } from "@quard/shared";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunItem } from "./ingest/rows.ts";
import { decision, item, RUN, STEP, TOOL_STEP } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { decisionTotals, guardBlockHours, guardCounts, latestDecisions } from "./decisions.ts";
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

const HOUR = 3_600_000;
const range = { since: new Date("2026-10-03T12:00:00.000Z"), until: new Date("2026-10-03T12:10:00.000Z") };

// The action block from test/events.ts, with some fields changed
const ruling = (at: string, fields: Partial<DecisionEvent> = {}): RunItem => item({ ...decision(at), ...fields });

const allow = (at: string, guard: string): RunItem =>
    ruling(at, { guard, rule: guard, decision: "allow", reason: undefined, field: undefined });

const requested = (at: string, verdict: "allow" | "block", tool = "payInvoice"): RunItem =>
    ruling(at, { guard: "permission", rule: "requested-call", decision: verdict, stepId: STEP, tool });

const observed = (at: string, verdict: "block" | "ask" = "block"): RunItem =>
    ruling(at, { decision: verdict, mode: "observe", enforced: false });

describe("latestDecisions", () => {
    it("is empty for a project with no decisions", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await latestDecisions(test.db, projectId, { ...range, limit: 10 })).toEqual([]);
    });

    it("lists decisions newest first without routine allows", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        const first = ruling("2026-10-03T12:00:00.000Z");
        await ingestBatch(test.db, projectId, [
            ruling("2026-10-03T11:59:59.999Z"),
            first,
            requested("2026-10-03T12:00:01.000Z", "allow"),
            allow("2026-10-03T12:00:02.000Z", "limit"),
            requested("2026-10-03T12:00:03.000Z", "block", "deleteFiles"),
            ruling("2026-10-03T12:00:04.000Z", { guard: "limit", rule: "max-calls-per-run" }),
            item({
                ...decision("2026-10-03T12:00:05.000Z"),
                runId: "a".repeat(32),
                guard: "egress",
                decision: "allow",
            }),
            observed("2026-10-03T12:00:06.000Z"),
            ruling("2026-10-03T12:10:00.000Z"),
        ]);
        await ingestBatch(test.db, other, [ruling("2026-10-03T12:05:00.000Z")]);

        const rows = await latestDecisions(test.db, projectId, { ...range, limit: 10 });

        expect(rows.map((row) => [row.guard, row.decision, row.mode, row.runId === RUN])).toEqual([
            ["action", "block", "observe", true],
            ["egress", "allow", "block", false],
            ["limit", "block", "block", true],
            ["permission", "block", "block", true],
            ["action", "block", "block", true],
        ]);
        expect(rows.at(-1)).toEqual({
            eventId: first.id,
            runId: RUN,
            stepId: TOOL_STEP,
            agent: "billing",
            tool: "payInvoice",
            guard: "action",
            rule: "iban:from",
            decision: "block",
            mode: "block",
            enforced: true,
            reason: "value_not_from_allowed_origin",
            field: "iban",
            at: new Date("2026-10-03T12:00:00.000Z"),
            rulesHash: null,
            requestId: null,
        });
    });

    it("breaks ties by event id and stops at the limit", async () => {
        const projectId = await createProject(test.db, "Acme");
        const at = (id: string, time: string): RunItem => ({ id: id.repeat(16), event: decision(time) });
        await ingestBatch(test.db, projectId, [
            at("1", "2026-10-03T12:05:00.000Z"),
            at("2", "2026-10-03T12:05:00.000Z"),
            at("3", "2026-10-03T12:01:00.000Z"),
        ]);

        const rows = await latestDecisions(test.db, projectId, { ...range, limit: 2 });

        expect(rows.map((row) => row.eventId)).toEqual(["2".repeat(16), "1".repeat(16)]);
    });
});

describe("decisionTotals", () => {
    it("is zero for a project with no decisions", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await decisionTotals(test.db, projectId, range)).toEqual({ blocked: 0, asked: 0 });
    });

    it("counts enforced blocks and asks from since up to until", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            ruling("2026-10-03T11:59:59.999Z"),
            ruling("2026-10-03T12:00:00.000Z"),
            requested("2026-10-03T12:00:01.000Z", "block"),
            requested("2026-10-03T12:00:02.000Z", "allow"),
            ruling("2026-10-03T12:00:03.000Z", { guard: "approval", rule: "approval", decision: "ask" }),
            observed("2026-10-03T12:00:04.000Z"),
            observed("2026-10-03T12:00:05.000Z", "ask"),
            ruling("2026-10-03T12:10:00.000Z"),
        ]);
        await ingestBatch(test.db, other, [ruling("2026-10-03T12:05:00.000Z")]);

        expect(await decisionTotals(test.db, projectId, range)).toEqual({ blocked: 2, asked: 1 });
    });
});

describe("guardCounts", () => {
    it("is empty for a project with no decisions", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await guardCounts(test.db, projectId, range)).toEqual([]);
    });

    it("counts decisions per guard without permission allows, the most first", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            ruling("2026-10-03T12:00:00.000Z"),
            ruling("2026-10-03T12:00:01.000Z"),
            observed("2026-10-03T12:00:02.000Z"),
            ruling("2026-10-03T12:00:03.000Z", { guard: "source", rule: "source", decision: "pass" }),
            ruling("2026-10-03T12:00:04.000Z", { guard: "source", rule: "source", decision: "strip" }),
            requested("2026-10-03T12:00:05.000Z", "allow"),
            requested("2026-10-03T12:00:06.000Z", "block"),
            allow("2026-10-03T12:00:07.000Z", "limit"),
            allow("2026-10-03T12:00:08.000Z", "egress"),
            ruling("2026-10-03T12:10:00.000Z", { guard: "egress" }),
        ]);
        await ingestBatch(test.db, other, [ruling("2026-10-03T12:05:00.000Z", { guard: "limit" })]);

        expect(await guardCounts(test.db, projectId, range)).toEqual([
            { guard: "action", count: 3 },
            { guard: "source", count: 2 },
            { guard: "egress", count: 1 },
            { guard: "limit", count: 1 },
            { guard: "permission", count: 1 },
        ]);
    });
});

describe("guardBlockHours", () => {
    const day = { since: new Date("2026-10-03T00:00:00.000Z"), until: new Date("2026-10-04T00:00:00.000Z") };
    const hour = (h: number) => Date.UTC(2026, 9, 3, h) / HOUR;

    it("is empty for a project with no decisions", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await guardBlockHours(test.db, projectId, day)).toEqual([]);
    });

    it("counts enforced blocks per guard and epoch hour", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            ruling("2026-10-02T23:59:59.999Z"),
            requested("2026-10-03T00:00:00.000Z", "block"),
            ruling("2026-10-03T10:15:00.000Z"),
            ruling("2026-10-03T10:30:00.000Z", { guard: "egress", rule: "untrusted-destination" }),
            ruling("2026-10-03T10:45:00.000Z"),
            observed("2026-10-03T11:00:00.000Z"),
            ruling("2026-10-03T11:15:00.000Z", { guard: "approval", rule: "approval", decision: "ask" }),
            requested("2026-10-03T11:30:00.000Z", "allow"),
            ruling("2026-10-03T23:30:00.000Z"),
            ruling("2026-10-04T00:00:00.000Z"),
        ]);
        await ingestBatch(test.db, other, [ruling("2026-10-03T10:15:00.000Z")]);

        expect(await guardBlockHours(test.db, projectId, day)).toEqual([
            { guard: "permission", hour: hour(0), blocks: 1 },
            { guard: "action", hour: hour(10), blocks: 2 },
            { guard: "egress", hour: hour(10), blocks: 1 },
            { guard: "action", hour: hour(23), blocks: 1 },
        ]);
    });
});
