import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { droppedEvents, recordDropped } from "./drops.ts";

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

describe("dropped events", () => {
    it("sums the drops since a time, a resent batch once", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordDropped(test.db, projectId, "a".repeat(16), 4, T1);
        await recordDropped(test.db, projectId, "b".repeat(16), 3, T2);
        await recordDropped(test.db, projectId, "b".repeat(16), 3, T3);
        await recordDropped(test.db, projectId, "c".repeat(16), 2, T3);

        expect(await droppedEvents(test.db, projectId, T2)).toEqual({ count: 5, lastAt: T3 });
        expect(await droppedEvents(test.db, projectId, T1)).toEqual({ count: 9, lastAt: T3 });
    });

    it("says none when nothing was dropped", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await recordDropped(test.db, other, "a".repeat(16), 4, T1);
        await recordDropped(test.db, projectId, "a".repeat(16), 0, T1);

        expect(await droppedEvents(test.db, projectId, T1)).toEqual({ count: 0, lastAt: null });
    });
});
