import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunItem } from "./ingest/rows.ts";
import { item, modelCall, started, toolCall } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { modelCallBuckets, runStartBuckets } from "./activity.ts";
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

const MINUTE = 60_000;
const range = {
    since: new Date("2026-10-03T00:00:00.000Z"),
    until: new Date("2026-10-03T01:00:00.000Z"),
    bucketMs: 10 * MINUTE,
};

const stepId = (n: number) => n.toString(16).padStart(16, "0");

const call = (n: number, at: string, agent = "billing"): RunItem =>
    item({ ...modelCall(at), stepId: stepId(n), agent });

const start = (runId: string, at: string): RunItem => item({ ...started(at), runId });

describe("modelCallBuckets", () => {
    it("is empty for a project with no calls", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await modelCallBuckets(test.db, projectId, range)).toEqual([]);
    });

    it("counts model calls per bucket from since up to until", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            call(1, "2026-10-02T23:59:59.999Z"),
            call(2, "2026-10-03T00:00:00.000Z"),
            call(3, "2026-10-03T00:09:59.999Z"),
            call(4, "2026-10-03T00:10:00.000Z"),
            item({ ...modelCall("2026-10-03T00:35:00.000Z"), stepId: stepId(5), status: "error" }),
            call(6, "2026-10-03T00:35:00.000Z", "researcher"),
            call(7, "2026-10-03T00:59:59.999Z"),
            call(8, "2026-10-03T01:00:00.000Z"),
            item(toolCall("ok", "2026-10-03T00:20:00.000Z")),
        ]);
        await ingestBatch(test.db, other, [call(1, "2026-10-03T00:20:00.000Z")]);

        expect(await modelCallBuckets(test.db, projectId, range)).toEqual([
            { bucket: 0, count: 2 },
            { bucket: 1, count: 1 },
            { bucket: 3, count: 2 },
            { bucket: 5, count: 1 },
        ]);
    });

    it("keeps to one agent when one is given", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            call(1, "2026-10-03T00:05:00.000Z"),
            call(2, "2026-10-03T00:35:00.000Z", "researcher"),
        ]);

        expect(await modelCallBuckets(test.db, projectId, { ...range, agent: "researcher" })).toEqual([
            { bucket: 3, count: 1 },
        ]);
        expect(await modelCallBuckets(test.db, projectId, { ...range, agent: "nobody" })).toEqual([]);
    });
});

describe("runStartBuckets", () => {
    it("is empty for a project with no runs", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await runStartBuckets(test.db, projectId, range)).toEqual([]);
    });

    it("counts runs per bucket by start time from since up to until", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, projectId, [
            start("a".repeat(32), "2026-10-02T23:59:59.999Z"),
            start("b".repeat(32), "2026-10-03T00:00:00.000Z"),
            start("c".repeat(32), "2026-10-03T00:25:00.000Z"),
            start("d".repeat(32), "2026-10-03T00:29:59.999Z"),
            start("e".repeat(32), "2026-10-03T01:00:00.000Z"),
        ]);
        await ingestBatch(test.db, other, [start("c".repeat(32), "2026-10-03T00:25:00.000Z")]);

        expect(await runStartBuckets(test.db, projectId, range)).toEqual([
            { bucket: 0, count: 1 },
            { bucket: 2, count: 2 },
        ]);
    });

    it("buckets by the earliest event of a run", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [start("f".repeat(32), "2026-10-03T00:45:00.000Z")]);
        await ingestBatch(test.db, projectId, [
            item({ ...modelCall("2026-10-03T00:15:00.000Z"), runId: "f".repeat(32) }),
        ]);

        expect(await runStartBuckets(test.db, projectId, range)).toEqual([{ bucket: 1, count: 1 }]);
    });
});
