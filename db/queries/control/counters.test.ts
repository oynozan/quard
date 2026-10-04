import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../connect/connect.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { addDayCounts, dayCounts, type DayCountInput } from "./counters.ts";

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

const DAY = "2026-10-03";
const calls = { day: DAY, tool: "payInvoice", counter: "calls" };
const amount = { day: DAY, tool: "payInvoice", counter: "amount:amount" };

// One count, as the single-counter cases below add
async function addDayCount(db: Db, projectId: string, input: typeof calls & { add: number; max?: number }) {
    const { day, tool, counter, add, max } = input;
    const { ok, used } = await addDayCounts(db, projectId, { day, tool }, [{ counter, add, max }]);
    return { ok, used: used[0] };
}

describe("addDayCounts with one count", () => {
    it("always adds without a max", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addDayCount(test.db, projectId, { ...calls, add: 1 })).toEqual({ ok: true, used: 1 });
        expect(await addDayCount(test.db, projectId, { ...calls, add: 1 })).toEqual({ ok: true, used: 2 });
        expect(await addDayCount(test.db, projectId, { ...amount, add: 4950.5 })).toEqual({ ok: true, used: 4950.5 });
    });

    it("adds up to the max and refuses what would go over it", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addDayCount(test.db, projectId, { ...amount, add: 30_000, max: 50_000 })).toEqual({
            ok: true,
            used: 30_000,
        });
        expect(await addDayCount(test.db, projectId, { ...amount, add: 20_001, max: 50_000 })).toEqual({
            ok: false,
            used: 30_000,
        });
        expect(await addDayCount(test.db, projectId, { ...amount, add: 20_000, max: 50_000 })).toEqual({
            ok: true,
            used: 50_000,
        });
        expect(await addDayCount(test.db, projectId, { ...amount, add: 0.01, max: 50_000 })).toEqual({
            ok: false,
            used: 50_000,
        });
        // Without a max, for example a count replayed after a reconnect, it still adds
        expect(await addDayCount(test.db, projectId, { ...amount, add: 10 })).toEqual({ ok: true, used: 50_010 });
    });

    it("refuses a first add that is already over the max, and writes nothing", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addDayCount(test.db, projectId, { ...amount, add: 60_000, max: 50_000 })).toEqual({
            ok: false,
            used: 0,
        });
        expect(await dayCounts(test.db, projectId, DAY)).toEqual([]);
    });

    it("never passes the max when calls at the cap race", async () => {
        const projectId = await createProject(test.db, "Acme");

        const results = await Promise.all(
            Array.from({ length: 8 }, () => addDayCount(many, projectId, { ...calls, add: 1, max: 5 })),
        );

        expect(results.filter((result) => result.ok)).toHaveLength(5);
        expect(results.filter((result) => !result.ok).every((result) => result.used === 5)).toBe(true);
        expect(await dayCounts(test.db, projectId, DAY)).toEqual([{ ...calls, used: 5 }]);
    });

    it("keeps days, tools, counters and projects apart", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await addDayCount(test.db, one, { ...calls, add: 3, max: 3 });

        expect(await addDayCount(test.db, one, { ...calls, day: "2026-10-04", add: 1, max: 3 })).toMatchObject({
            ok: true,
        });
        expect(await addDayCount(test.db, one, { ...calls, tool: "refund", add: 1, max: 3 })).toMatchObject({
            ok: true,
        });
        expect(await addDayCount(test.db, one, { ...amount, add: 1, max: 3 })).toMatchObject({ ok: true });
        expect(await addDayCount(test.db, two, { ...calls, add: 1, max: 3 })).toEqual({ ok: true, used: 1 });
        expect(await addDayCount(test.db, one, { ...calls, add: 1, max: 3 })).toEqual({ ok: false, used: 3 });
    });
});

describe("addDayCounts with several counts", () => {
    const pay = { day: DAY, tool: "payInvoice" };
    const callCount = (max?: number): DayCountInput => ({ counter: "calls", add: 1, max });
    const amountCount = (add: number): DayCountInput => ({ counter: "amount:amount", add, max: 1000 });

    it("adds every count, and gives each total in the order sent", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await addDayCounts(test.db, projectId, pay, [callCount(5), amountCount(900)])).toEqual({
            ok: true,
            used: [1, 900],
        });
    });

    it("adds none when one would pass its max, and gives the totals as they stay", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addDayCounts(test.db, projectId, pay, [callCount(5), amountCount(900)]);

        expect(await addDayCounts(test.db, projectId, pay, [callCount(5), amountCount(200)])).toEqual({
            ok: false,
            used: [1, 900],
        });
        expect(
            await addDayCounts(test.db, projectId, { ...pay, tool: "refund" }, [callCount(), amountCount(1001)]),
        ).toEqual({ ok: false, used: [0, 0] });
        expect(await dayCounts(test.db, projectId, DAY)).toEqual([
            { ...amount, used: 900 },
            { ...calls, used: 1 },
        ]);
    });

    it("never passes a max when calls race with their counts in either order", async () => {
        const projectId = await createProject(test.db, "Acme");
        const capped = { counter: "amount:amount", add: 10, max: 50 };

        const results = await Promise.all(
            Array.from({ length: 8 }, (_, n) =>
                addDayCounts(many, projectId, pay, n % 2 === 0 ? [capped, callCount()] : [callCount(), capped]),
            ),
        );

        expect(results.filter((result) => result.ok)).toHaveLength(5);
        expect(await dayCounts(test.db, projectId, DAY)).toEqual([
            { ...amount, used: 50 },
            { ...calls, used: 5 },
        ]);
    });
});

describe("dayCounts", () => {
    it("lists one day's counters in the project, with the day as text", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addDayCount(test.db, projectId, { ...calls, tool: "refund", add: 2 });
        await addDayCount(test.db, projectId, { ...amount, add: 4950 });
        await addDayCount(test.db, projectId, { ...calls, add: 1 });
        await addDayCount(test.db, projectId, { ...calls, day: "2026-10-02", add: 7 });

        expect(await dayCounts(test.db, projectId, DAY)).toEqual([
            { tool: "payInvoice", counter: "amount:amount", day: DAY, used: 4950 },
            { tool: "payInvoice", counter: "calls", day: DAY, used: 1 },
            { tool: "refund", counter: "calls", day: DAY, used: 2 },
        ]);
        expect(await dayCounts(test.db, await createProject(test.db, "Other"), DAY)).toEqual([]);
    });
});

// Last in the file, since a failed query can leave the PGlite test connection out of step
describe("addDayCounts when the query fails", () => {
    it("passes the error on", async () => {
        const pay = { day: DAY, tool: "payInvoice" };

        await expect(addDayCounts(test.db, "not-a-project", pay, [{ counter: "calls", add: 1 }])).rejects.toThrow();
    });
});
