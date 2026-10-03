import { addDayCount, recordFleetUse } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brokenDb, newConnection, newProject, testContext } from "../test/context.ts";
import { fleetMessage, helloMessage, IBAN_VALUE, RULES } from "../test/messages.ts";
import { hello, utcDay } from "./hello.ts";

const DAY = 86_400_000;

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("utcDay", () => {
    it("gives the UTC day", () => {
        expect(utcDay(new Date("2026-10-03T23:30:00.000-02:00"))).toBe("2026-10-04");
    });
});

describe("hello", () => {
    it("stores the connection and its rules, then sends ready", async () => {
        const project = await newProject(test.db);
        const now = new Date();
        const ctx = testContext(test.db, { now: () => now });
        const { connection, socket } = newConnection(ctx, project);

        await hello(ctx, connection, helloMessage());

        expect(connection.id).toMatch(/^con_[0-9a-f]{16}$/);
        expect(socket.sent).toEqual([
            { type: "ready", at: now.toISOString(), quarantine: [], fleetObserveUntil: null, counters: [] },
        ]);
        expect(ctx.registry.inProject(project.projectId)).toEqual([connection]);
        const row = await test.db
            .selectFrom("sdk_connections")
            .selectAll()
            .where("id", "=", connection.id)
            .executeTakeFirstOrThrow();
        expect(row).toMatchObject({
            key_id: project.keyId,
            sdk: "0.0.0",
            host: "box-1",
            pid: 4242,
            rules_hash: RULES.hash,
            disconnected_at: null,
        });
        const rules = await test.db
            .selectFrom("rule_sets")
            .select("rules")
            .where("project_id", "=", project.projectId)
            .executeTakeFirstOrThrow();
        expect(rules.rules).toEqual(RULES.list);
    });

    it("sends today's counters, the quarantine list and the end of observe mode", async () => {
        const project = await newProject(test.db);
        const now = new Date();
        const ctx = testContext(test.db, { now: () => now });
        const day = { tool: "payInvoice", counter: "calls" };
        await addDayCount(test.db, project.projectId, { ...day, day: utcDay(now), add: 3 });
        await addDayCount(test.db, project.projectId, { ...day, day: "2020-01-01", add: 9 });
        for (let n = 1; n <= 5; n += 1) {
            const { runId, agent, tool, blocked, values } = fleetMessage(n, [IBAN_VALUE]);
            await recordFleetUse(test.db, project.projectId, { runId, agent, tool, blocked, values }, now);
        }
        const { connection, socket } = newConnection(ctx, project);

        await hello(ctx, connection, helloMessage());

        expect(socket.of("ready")).toEqual([
            {
                type: "ready",
                at: now.toISOString(),
                quarantine: [{ key: IBAN_VALUE.key, observe: true }],
                fleetObserveUntil: new Date(now.getTime() + 7 * DAY).toISOString(),
                counters: [{ ...day, day: utcDay(now), used: 3 }],
            },
        ]);
        expect(connection.known).toEqual(new Map([[IBAN_VALUE.key, true]]));
    });

    it("closes the socket when the session can't start", async () => {
        const project = await newProject(test.db);
        const db = brokenDb();
        const ctx = testContext(db);
        const { connection, socket } = newConnection(ctx, project);

        await hello(ctx, connection, helloMessage());

        expect(socket.closedWith).toEqual({ code: 1011, reason: "control could not start the session" });
        expect(ctx.logs).toEqual([expect.stringContaining("control: hello failed: ")]);
        expect(connection.ready).toBe(false);
        await db.destroy();
    });
});
