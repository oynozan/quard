import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newProject, readyConnection, testContext } from "../test/context.ts";
import { DOMAIN_VALUE, fleetMessage, IBAN_VALUE } from "../test/messages.ts";
import { fleet } from "./record.ts";

const HOUR = 3_600_000;
const T0 = new Date("2026-10-03T12:00:00.000Z");

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

function after(hours: number): Date {
    return new Date(T0.getTime() + hours * HOUR);
}

describe("fleet", () => {
    it("records a use and says when observe mode ends", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db, { now: () => T0 });
        const { connection, socket } = await readyConnection(ctx, project);
        const message = fleetMessage(1, [IBAN_VALUE, DOMAIN_VALUE]);

        await fleet(ctx, connection, message);

        expect(socket.of("fleet_result")).toEqual([
            { type: "fleet_result", id: message.id, quarantined: [], fleetObserveUntil: after(7 * 24).toISOString() },
        ]);
        const uses = await test.db
            .selectFrom("fleet_uses")
            .select(["key", "blocked"])
            .where("project_id", "=", project.projectId)
            .orderBy("key")
            .execute();
        expect(uses).toEqual([
            { key: DOMAIN_VALUE.key, blocked: false },
            { key: IBAN_VALUE.key, blocked: false },
        ]);
    });

    it("quarantines a new value used by five runs and tells every SDK in the project", async () => {
        const project = await newProject(test.db);
        const elsewhere = await newProject(test.db, "Other");
        const ctx = testContext(test.db, { now: () => T0 });
        const caller = await readyConnection(ctx, project);
        const peer = await readyConnection(ctx, project);
        const stranger = await readyConnection(ctx, elsewhere);

        for (let n = 1; n <= 5; n += 1) {
            await fleet(ctx, caller.connection, fleetMessage(n, [IBAN_VALUE], { blocked: n === 5 }));
        }

        const entry = { key: IBAN_VALUE.key, observe: true };
        expect(caller.socket.of("fleet_result").map((result) => result.quarantined)).toEqual([[], [], [], [], [entry]]);
        expect(caller.socket.of("quarantine")).toEqual([]);
        expect(caller.connection.known).toEqual(new Map([[IBAN_VALUE.key, true]]));
        expect(peer.socket.of("quarantine")).toEqual([{ type: "quarantine", add: [entry], remove: [] }]);
        expect(stranger.socket.of("quarantine")).toEqual([]);
    });

    it("enforces an observed value that stays busy after the observe days", async () => {
        const project = await newProject(test.db);
        let now = T0;
        const ctx = testContext(test.db, { now: () => now });
        const caller = await readyConnection(ctx, project);
        const peer = await readyConnection(ctx, project);
        // The first use starts the observe days
        await fleet(ctx, caller.connection, fleetMessage(1, [DOMAIN_VALUE]));
        now = after(7 * 24 - 1);
        for (let n = 2; n <= 6; n += 1) {
            await fleet(ctx, caller.connection, fleetMessage(n, [IBAN_VALUE]));
        }

        now = after(7 * 24 + 1);
        await fleet(ctx, caller.connection, fleetMessage(7, [IBAN_VALUE]));

        expect(caller.socket.of("fleet_result").at(-1)?.quarantined).toEqual([{ key: IBAN_VALUE.key, observe: false }]);
        expect(peer.socket.of("quarantine")).toEqual([
            { type: "quarantine", add: [{ key: IBAN_VALUE.key, observe: true }], remove: [] },
            { type: "quarantine", add: [{ key: IBAN_VALUE.key, observe: false }], remove: [] },
        ]);
    });
});
