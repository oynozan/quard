import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../../connect/connect.ts";
import { after, DOMAIN, EMAIL, IBAN, T0, use } from "../../../test/fleet.ts";
import { listeningDb, settle } from "../../../test/notify.ts";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { createProject } from "../../projects.ts";
import { recordFleetUse } from "./record.ts";
import { fleetObserveUntil, markValueKnown, quarantineList } from "./state.ts";

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

const WEEK = 7 * 24;

// Runs from..to each use the values once, an hour apart from `start`
async function runs(projectId: string, from: number, to: number, values = [IBAN], start = 0) {
    const results = [];
    for (let n = from; n <= to; n += 1) {
        results.push(await recordFleetUse(test.db, projectId, use(n, values), after(start + (n - from) / 60)));
    }
    return results;
}

describe("recordFleetUse", () => {
    it("starts the check on first use, and stores each value and use", async () => {
        const projectId = await createProject(test.db, "Acme");
        expect(await fleetObserveUntil(test.db, projectId)).toBeNull();

        const first = await recordFleetUse(test.db, projectId, use(1, [IBAN, { ...IBAN, field: "to" }]), T0);
        const later = await recordFleetUse(test.db, projectId, use(2, [IBAN], { blocked: true }), after(1));

        expect(first).toEqual({ quarantined: [], added: [], observeUntil: after(WEEK) });
        expect(later.observeUntil).toEqual(after(WEEK));
        expect(await fleetObserveUntil(test.db, projectId)).toEqual(after(WEEK));
        const values = await test.db
            .selectFrom("fleet_values")
            .selectAll()
            .where("project_id", "=", projectId)
            .execute();
        expect(values).toEqual([
            expect.objectContaining({ key: IBAN.key, kind: "iban", field: "iban", first_seen_at: T0, observe: false }),
        ]);
        const uses = await test.db
            .selectFrom("fleet_uses")
            .select(["run_id", "agent", "tool", "blocked", "at"])
            .where("project_id", "=", projectId)
            .orderBy("at")
            .execute();
        expect(uses.map((row) => [row.blocked, row.at])).toEqual([
            [false, T0],
            [true, after(1)],
        ]);
    });

    it("starts the clock even for a call without values", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await recordFleetUse(test.db, projectId, use(1, []), T0)).toEqual({
            quarantined: [],
            added: [],
            observeUntil: after(WEEK),
        });
        expect(
            await test.db.selectFrom("fleet_uses").selectAll().where("project_id", "=", projectId).execute(),
        ).toEqual([]);
    });

    it("quarantines a new value at its 5th separate run, observing in the first days", async () => {
        const projectId = await createProject(test.db, "Acme");
        const early = await runs(projectId, 1, 4);
        // The same run again is not a new run
        const again = await recordFleetUse(test.db, projectId, use(4, [IBAN, EMAIL]), after(0.1));
        const fifth = await recordFleetUse(test.db, projectId, use(5, [IBAN, EMAIL]), after(0.2));
        const sixth = await recordFleetUse(test.db, projectId, use(6, [EMAIL, IBAN]), after(0.3));

        expect(early.every((result) => result.added.length === 0 && result.quarantined.length === 0)).toBe(true);
        expect(again).toMatchObject({ quarantined: [], added: [] });
        expect(fifth).toMatchObject({
            added: [{ key: IBAN.key, observe: true }],
            quarantined: [{ key: IBAN.key, observe: true }],
        });
        expect(sixth).toMatchObject({ added: [], quarantined: [{ key: IBAN.key, observe: true }] });
        expect(await quarantineList(test.db, projectId)).toEqual([{ key: IBAN.key, observe: true }]);
    });

    it("counts only the runs of the last 24 hours, blocked attempts included", async () => {
        const projectId = await createProject(test.db, "Acme");
        await runs(projectId, 1, 4);

        const late = await runs(projectId, 5, 8, [IBAN], 25);
        const blocked = await recordFleetUse(test.db, projectId, use(9, [IBAN], { blocked: true }), after(25.5));

        expect(late.every((result) => result.added.length === 0)).toBe(true);
        expect(blocked.added).toEqual([{ key: IBAN.key, observe: true }]);
    });

    it("never quarantines a value first seen more than 7 days ago", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [IBAN]), T0);

        const results = await runs(projectId, 2, 8, [IBAN], WEEK + 1);

        expect(results.every((result) => result.quarantined.length === 0)).toBe(true);
        expect(await quarantineList(test.db, projectId)).toEqual([]);
    });

    it("enforces after the observe days, and upgrades an observe entry that is still busy", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [DOMAIN]), T0);
        const observed = await runs(projectId, 2, 6, [IBAN], WEEK - 12);
        expect(observed.at(-1)?.added).toEqual([{ key: IBAN.key, observe: true }]);

        const upgraded = await recordFleetUse(test.db, projectId, use(7, [IBAN]), after(WEEK + 1));
        const steady = await recordFleetUse(test.db, projectId, use(8, [IBAN]), after(WEEK + 2));
        const fresh = await runs(projectId, 9, 13, [EMAIL], WEEK + 3);

        expect(upgraded).toMatchObject({
            added: [{ key: IBAN.key, observe: false }],
            quarantined: [{ key: IBAN.key, observe: false }],
        });
        expect(steady).toMatchObject({ added: [], quarantined: [{ key: IBAN.key, observe: false }] });
        expect(fresh.at(-1)?.added).toEqual([{ key: EMAIL.key, observe: false }]);
        expect(await quarantineList(test.db, projectId)).toEqual([
            { key: EMAIL.key, observe: false },
            { key: IBAN.key, observe: false },
        ]);
    });

    it("leaves an observe entry alone once it is no longer busy", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [DOMAIN]), T0);
        await runs(projectId, 2, 6, [IBAN], WEEK - 1);

        // Past the observe days, but the 5 runs are older than 24 hours
        const quiet = await recordFleetUse(test.db, projectId, use(7, [IBAN]), after(WEEK + 30));

        expect(quiet).toMatchObject({ added: [], quarantined: [{ key: IBAN.key, observe: true }] });
        expect(quiet.observeUntil).toEqual(after(WEEK));
    });

    it("never quarantines a value someone marked as known", async () => {
        const projectId = await createProject(test.db, "Acme");
        await runs(projectId, 1, 5);
        expect(await markValueKnown(test.db, projectId, IBAN.key, "dana@acme.com")).toBe(true);

        const results = await runs(projectId, 6, 7, [IBAN], 1);

        expect(results.every((result) => result.quarantined.length === 0)).toBe(true);
        expect(await quarantineList(test.db, projectId)).toEqual([]);
    });

    it("counts two runs at the same time, so one of them quarantines", async () => {
        const projectId = await createProject(test.db, "Acme");
        await runs(projectId, 1, 3);

        const results = await Promise.all(
            [4, 5, 6].map((n) => recordFleetUse(many, projectId, use(n, [IBAN]), after(1))),
        );

        expect(results.filter((result) => result.added.length > 0)).toHaveLength(1);
        expect(results.filter((result) => result.quarantined.length > 0)).toHaveLength(2);
    });

    it("announces only the calls that change the list", async () => {
        const listening = await listeningDb(test.url);
        try {
            const projectId = await createProject(listening.db, "Acme");
            for (let n = 1; n <= 6; n += 1) {
                await recordFleetUse(listening.db, projectId, use(n, [IBAN]), after(n / 60));
            }
            await settle();

            expect(listening.heard).toEqual([{ channel: "quard_fleet", payload: projectId }]);
        } finally {
            await listening.stop();
        }
    });
});
