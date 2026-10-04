import { dayCounts } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newProject, readyConnection, testContext } from "../test/context.ts";
import { countMessage } from "../test/messages.ts";
import { count } from "./count.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("count", () => {
    it("adds to a per-day counter shared by the project", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const first = await readyConnection(ctx, project);
        const second = await readyConnection(ctx, project);
        const message = countMessage({ counts: [{ counter: "amount:amount", add: 4950.5 }] });

        await count(ctx, first.connection, message);
        await count(ctx, second.connection, {
            ...message,
            id: "f".repeat(16),
            counts: [{ counter: "amount:amount", add: 50 }],
        });

        expect(first.socket.of("counted")).toEqual([{ type: "counted", id: message.id, ok: true, used: [4950.5] }]);
        expect(second.socket.of("counted")).toEqual([
            { type: "counted", id: "f".repeat(16), ok: true, used: [5000.5] },
        ]);
        expect(await dayCounts(test.db, project.projectId, message.day)).toEqual([
            { tool: "payInvoice", counter: "amount:amount", day: message.day, used: 5000.5 },
        ]);
    });

    it("never adds past the cap", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);

        for (let n = 0; n < 3; n += 1) {
            await count(ctx, connection, countMessage({ counts: [{ counter: "calls", add: 1, max: 2 }] }));
        }

        expect(socket.of("counted").map(({ ok, used }) => ({ ok, used }))).toEqual([
            { ok: true, used: [1] },
            { ok: true, used: [2] },
            { ok: false, used: [2] },
        ]);
    });

    it("adds a call's counts all together, or none of them", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);
        const pay = (amount: number) =>
            countMessage({
                counts: [
                    { counter: "calls", add: 1, max: 5 },
                    { counter: "amount:amount", add: amount, max: 1000 },
                ],
            });
        const message = pay(900);

        await count(ctx, connection, message);
        await count(ctx, connection, pay(200));

        expect(socket.of("counted").map(({ ok, used }) => ({ ok, used }))).toEqual([
            { ok: true, used: [1, 900] },
            { ok: false, used: [1, 900] },
        ]);
        expect(await dayCounts(test.db, project.projectId, message.day)).toEqual([
            { tool: "payInvoice", counter: "amount:amount", day: message.day, used: 900 },
            { tool: "payInvoice", counter: "calls", day: message.day, used: 1 },
        ]);
    });
});
