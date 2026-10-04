import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { listConfigErrors, recordConfigErrors } from "./config-errors.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const T1 = new Date("2026-10-03T12:00:00.000Z");
const T2 = new Date("2026-10-03T13:00:00.000Z");
const T3 = new Date("2026-10-03T14:00:00.000Z");
const feedDown = { source: "signatures" as const, message: "feed unreachable" };
const badPolicy = { source: "policy" as const, message: "line 3: unknown guard" };

describe("config errors", () => {
    it("keeps one counted row per source and message, newest first", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordConfigErrors(test.db, projectId, [feedDown, feedDown, badPolicy], T2);
        await recordConfigErrors(test.db, projectId, [feedDown], T3);
        // A batch that arrives late moves the first time back, not the last
        await recordConfigErrors(test.db, projectId, [badPolicy], T1);

        expect(await listConfigErrors(test.db, projectId, { limit: 10 })).toEqual([
            { ...feedDown, firstSeenAt: T2, lastSeenAt: T3, count: 3 },
            { ...badPolicy, firstSeenAt: T1, lastSeenAt: T2, count: 2 },
        ]);
        expect(await listConfigErrors(test.db, projectId, { limit: 1 })).toHaveLength(1);
    });

    it("keeps projects apart and stores nothing for no errors", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await recordConfigErrors(test.db, other, [feedDown], T1);
        await recordConfigErrors(test.db, projectId, [], T1);

        expect(await listConfigErrors(test.db, projectId, { limit: 10 })).toEqual([]);
        expect(await listConfigErrors(test.db, other, { limit: 10 })).toHaveLength(1);
    });
});
