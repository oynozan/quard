import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../connect/connect.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { addRunCount } from "./run-counters.ts";

let test: TestDb;
// A pool with several connections, for calls that race
let many: Db;

beforeAll(async () => {
    test = await startTestDb();
    many = connect(test.url, 4);
}, 60_000);

afterAll(async () => {
    await many.destroy();
    await test.stop();
});

const RUN = "1".repeat(32);
const OTHER_RUN = "2".repeat(32);

function counters(projectId: string) {
    return test.db
        .selectFrom("run_counters")
        .select(["run_id", "counter", "used"])
        .where("project_id", "=", projectId)
        .orderBy("run_id")
        .orderBy("counter")
        .execute();
}

describe("addRunCount", () => {
    it("always adds without a max", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addRunCount(test.db, projectId, RUN, "steps", 1)).toEqual({ ok: true, used: 1 });
        expect(await addRunCount(test.db, projectId, RUN, "steps", 1)).toEqual({ ok: true, used: 2 });
        expect(await addRunCount(test.db, projectId, RUN, "cost", 0.003075)).toEqual({ ok: true, used: 0.003075 });
    });

    it("moves the time of the last add, with or without a max", async () => {
        const projectId = await createProject(test.db, "Acme");
        const long = new Date("2026-01-01T00:00:00.000Z");
        const updatedAt = async () => {
            const row = await test.db
                .selectFrom("run_counters")
                .select("updated_at")
                .where("project_id", "=", projectId)
                .executeTakeFirstOrThrow();
            return row.updated_at.getTime();
        };
        const backdate = () =>
            test.db.updateTable("run_counters").set({ updated_at: long }).where("project_id", "=", projectId).execute();
        await addRunCount(test.db, projectId, RUN, "steps", 1);

        await backdate();
        await addRunCount(test.db, projectId, RUN, "steps", 1);
        expect(await updatedAt()).toBeGreaterThan(long.getTime());

        await backdate();
        await addRunCount(test.db, projectId, RUN, "steps", 1, 10);
        expect(await updatedAt()).toBeGreaterThan(long.getTime());
    });

    it("adds up to the max and refuses what would go over it", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addRunCount(test.db, projectId, RUN, "cost", 3, 5)).toEqual({ ok: true, used: 3 });
        expect(await addRunCount(test.db, projectId, RUN, "cost", 2.01, 5)).toEqual({ ok: false, used: 3 });
        expect(await addRunCount(test.db, projectId, RUN, "cost", 2, 5)).toEqual({ ok: true, used: 5 });
        expect(await addRunCount(test.db, projectId, RUN, "cost", 0.01, 5)).toEqual({ ok: false, used: 5 });
        // Without a max, for example a cost added after the call, it still adds
        expect(await addRunCount(test.db, projectId, RUN, "cost", 1)).toEqual({ ok: true, used: 6 });
    });

    it("refuses a first add that is already over the max, and writes nothing", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addRunCount(test.db, projectId, RUN, "amount:payInvoice:amount", 60_000, 50_000)).toEqual({
            ok: false,
            used: 0,
        });
        expect(await counters(projectId)).toEqual([]);
    });

    it("never passes the max when calls at the cap race", async () => {
        const projectId = await createProject(test.db, "Acme");

        const results = await Promise.all(
            Array.from({ length: 8 }, () => addRunCount(many, projectId, RUN, "steps", 1, 5)),
        );

        expect(results.filter((result) => result.ok)).toHaveLength(5);
        expect(results.filter((result) => !result.ok).every((result) => result.used === 5)).toBe(true);
        expect(await counters(projectId)).toEqual([{ run_id: RUN, counter: "steps", used: 5 }]);
    });

    it("keeps runs, counters and projects apart", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await addRunCount(test.db, one, RUN, "calls:payInvoice", 3, 3);

        expect(await addRunCount(test.db, one, OTHER_RUN, "calls:payInvoice", 1, 3)).toMatchObject({ ok: true });
        expect(await addRunCount(test.db, one, RUN, "calls:refund", 1, 3)).toMatchObject({ ok: true });
        expect(await addRunCount(test.db, two, RUN, "calls:payInvoice", 1, 3)).toEqual({ ok: true, used: 1 });
        expect(await addRunCount(test.db, one, RUN, "calls:payInvoice", 1, 3)).toEqual({ ok: false, used: 3 });
        expect(await counters(one)).toEqual([
            { run_id: RUN, counter: "calls:payInvoice", used: 3 },
            { run_id: RUN, counter: "calls:refund", used: 1 },
            { run_id: OTHER_RUN, counter: "calls:payInvoice", used: 1 },
        ]);
    });
});
