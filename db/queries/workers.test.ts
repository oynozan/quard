import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { beatWorker, lastWorkerSeen } from "./workers.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

beforeEach(async () => {
    await test.db.deleteFrom("workers").execute();
});

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const worker = (id: string) => ({ id, host: "box-1", pid: 4242, startedAt: new Date("2026-10-04T08:00:00.000Z") });

async function rows() {
    return test.db.selectFrom("workers").selectAll().orderBy("id").execute();
}

// A worker that last checked in `ms` ago
async function seen(id: string, ms: number) {
    await test.db
        .insertInto("workers")
        .values({ id, host: "box-2", pid: 7, started_at: ago(ms), seen_at: ago(ms) })
        .execute();
}

describe("beatWorker", () => {
    it("records the worker, then moves only its seen time on each beat", async () => {
        await beatWorker(test.db, worker("w1"));
        const [first] = await rows();
        expect(first).toMatchObject({ id: "w1", host: "box-1", pid: 4242, started_at: worker("w1").startedAt });
        expect(Math.abs(Date.now() - (first?.seen_at.getTime() ?? 0))).toBeLessThan(10_000);

        await test.db
            .updateTable("workers")
            .set({ seen_at: ago(HOUR) })
            .execute();
        await beatWorker(test.db, { ...worker("w1"), host: "box-9", pid: 1 });

        const [second] = await rows();
        expect(second).toMatchObject({ id: "w1", host: "box-1", pid: 4242 });
        expect(Math.abs(Date.now() - (second?.seen_at.getTime() ?? 0))).toBeLessThan(10_000);
    });

    it("forgets workers not seen for over a day", async () => {
        await seen("gone", 25 * HOUR);
        await seen("quiet", 23 * HOUR);

        await beatWorker(test.db, worker("w1"));

        expect((await rows()).map((row) => row.id)).toEqual(["quiet", "w1"]);
    });
});

describe("lastWorkerSeen", () => {
    it("is null when no worker checked in", async () => {
        expect(await lastWorkerSeen(test.db)).toBeNull();
    });

    it("finds the latest check-in of any worker", async () => {
        await seen("old", HOUR);
        await seen("recent", 5_000);
        await seen("older", 2 * HOUR);

        const recent = await test.db
            .selectFrom("workers")
            .select("seen_at")
            .where("id", "=", "recent")
            .executeTakeFirstOrThrow();
        expect(await lastWorkerSeen(test.db)).toEqual(recent.seen_at);
    });
});
