import { markValueKnown, recordFleetUse, type Db } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import type { FleetValue } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brokenDb, newConnection, newProject, readyConnection, testContext } from "../test/context.ts";
import { DOMAIN_VALUE, fleetMessage, IBAN_VALUE } from "../test/messages.ts";
import { tell } from "./sync.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// Five runs use the value, so it is quarantined in observe mode
async function quarantine(db: Db, projectId: string, value: FleetValue): Promise<void> {
    for (let n = 1; n <= 5; n += 1) {
        const { runId, agent, tool, blocked, values } = fleetMessage(n, [value]);
        await recordFleetUse(db, projectId, { runId, agent, tool, blocked, values });
    }
}

describe("refresh", () => {
    it("tells each SDK in the project what changed in the list", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        await quarantine(test.db, project.projectId, IBAN_VALUE);
        const { connection, socket } = await readyConnection(ctx, project);
        await quarantine(test.db, project.projectId, DOMAIN_VALUE);
        await markValueKnown(test.db, project.projectId, IBAN_VALUE.key, "dana@acme.com");

        await ctx.fleet.refresh(project.projectId);
        await ctx.fleet.refresh(project.projectId);

        expect(socket.of("quarantine")).toEqual([
            { type: "quarantine", add: [{ key: DOMAIN_VALUE.key, observe: true }], remove: [IBAN_VALUE.key] },
        ]);
        expect(connection.known).toEqual(new Map([[DOMAIN_VALUE.key, true]]));
    });

    it("reloads nothing for a project with no connections here", async () => {
        const db = brokenDb();
        const ctx = testContext(db);
        newConnection(ctx, { keyId: "k", projectId: "p" });

        await ctx.fleet.refresh("p");
        await ctx.fleet.refreshAll();

        await db.destroy();
    });

    it("reloads every project with connections", async () => {
        const first = await newProject(test.db);
        const second = await newProject(test.db);
        const ctx = testContext(test.db);
        const one = await readyConnection(ctx, first);
        const two = await readyConnection(ctx, second);
        await quarantine(test.db, first.projectId, IBAN_VALUE);
        await quarantine(test.db, second.projectId, DOMAIN_VALUE);

        await ctx.fleet.refreshAll();

        expect(one.socket.of("quarantine")).toEqual([
            { type: "quarantine", add: [{ key: IBAN_VALUE.key, observe: true }], remove: [] },
        ]);
        expect(two.socket.of("quarantine")).toEqual([
            { type: "quarantine", add: [{ key: DOMAIN_VALUE.key, observe: true }], remove: [] },
        ]);
    });
});

describe("inProject", () => {
    it("runs a project's work in turn, also after a failure", async () => {
        const ctx = testContext(test.db);
        const order: string[] = [];
        let release = () => {};
        const slow = ctx.fleet.inProject("p", async () => {
            await new Promise<void>((resolve) => (release = resolve));
            order.push("slow");
        });
        const failing = ctx.fleet.inProject("p", async () => {
            order.push("failing");
            throw new Error("nope");
        });
        const after = ctx.fleet.inProject("p", async () => {
            order.push("after");
            return 7;
        });
        const other = ctx.fleet.inProject("q", async () => {
            order.push("other project");
        });

        await other;
        release();
        await slow;
        await expect(failing).rejects.toThrow("nope");
        expect(await after).toBe(7);
        expect(order).toEqual(["other project", "slow", "failing", "after"]);
    });
});

describe("tell", () => {
    it("sends only the entries the SDK does not have", async () => {
        const ctx = testContext(test.db);
        const { connection, socket } = newConnection(ctx, { keyId: "k", projectId: "p" });
        connection.known.set(IBAN_VALUE.key, true);

        tell(connection, [{ key: IBAN_VALUE.key, observe: true }]);
        tell(connection, [
            { key: IBAN_VALUE.key, observe: false },
            { key: DOMAIN_VALUE.key, observe: true },
        ]);

        expect(socket.of("quarantine")).toEqual([
            {
                type: "quarantine",
                add: [
                    { key: IBAN_VALUE.key, observe: false },
                    { key: DOMAIN_VALUE.key, observe: true },
                ],
                remove: [],
            },
        ]);
    });
});
