import { beatWorker, lastWorkerSeen, type Db } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brokenDb } from "../test/context.ts";
import { healthRoutes } from "./health.ts";

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

function health(db: Db) {
    const logs: string[] = [];
    const app = healthRoutes({ db, log: (message) => logs.push(message) }, "control");
    return { logs, request: () => app.request("/health") };
}

describe("health route", () => {
    it("reports the service as ok, with no worker seen yet", async () => {
        const res = await health(test.db).request();

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "ok", service: "control", workerSeenAt: null });
    });

    it("says when a worker last checked in", async () => {
        await beatWorker(test.db, { id: "w1", host: "box-1", pid: 4242, startedAt: new Date() });
        const seen = await lastWorkerSeen(test.db);

        const res = await health(test.db).request();

        expect(await res.json()).toEqual({ status: "ok", service: "control", workerSeenAt: seen?.toISOString() });
    });

    it("still answers when the database can't say, and logs why", async () => {
        const db = brokenDb();
        const { logs, request } = health(db);

        const res = await request();

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "ok", service: "control", workerSeenAt: null });
        expect(logs).toEqual([expect.stringContaining("control: could not read when a worker was last seen: ")]);
        await db.destroy();
    });
});
