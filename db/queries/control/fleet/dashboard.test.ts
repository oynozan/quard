import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { after, DOMAIN, EMAIL, IBAN, T0, use } from "../../../test/fleet.ts";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { createProject } from "../../projects.ts";
import { fleetFields, listQuarantined, listWatched } from "./dashboard.ts";
import { recordFleetUse } from "./record.ts";
import { markValueKnown } from "./state.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("listQuarantined", () => {
    it("lists quarantined values newest first, with their runs, attempts and agents", async () => {
        const projectId = await createProject(test.db, "Acme");
        for (let n = 1; n <= 5; n += 1) {
            await recordFleetUse(test.db, projectId, use(n, [IBAN]), after(n / 60));
        }
        for (let n = 6; n <= 10; n += 1) {
            await recordFleetUse(test.db, projectId, use(n, [DOMAIN], { agent: "researcher" }), after(1 + n / 60));
        }
        await recordFleetUse(test.db, projectId, use(11, [IBAN], { agent: "support", blocked: true }), after(2));
        await recordFleetUse(test.db, projectId, use(11, [IBAN], { agent: "support", blocked: true }), after(3));

        const items = await listQuarantined(test.db, projectId);

        expect(items.map((item) => item.key)).toEqual([DOMAIN.key, IBAN.key]);
        expect(items[0]).toMatchObject({ kind: "domain", field: "url", value: "evil.com", hash: null, runs: 5 });
        expect(items[1]).toEqual({
            kind: "iban",
            field: "iban",
            key: IBAN.key,
            value: "GB33…5555",
            hash: "e".repeat(32),
            firstSeenAt: after(1 / 60),
            quarantinedAt: after(5 / 60),
            observe: true,
            runs: 6,
            blockedAttempts: 2,
            agents: ["billing", "support"],
            lastAttemptAt: after(3),
        });
        expect(await listQuarantined(test.db, await createProject(test.db, "Other"))).toEqual([]);
    });
});

describe("listWatched", () => {
    it("lists new values that are neither quarantined nor known, busiest first", async () => {
        const projectId = await createProject(test.db, "Acme");
        // Old by now: first seen more than 7 days before
        await recordFleetUse(test.db, projectId, use(1, [{ ...DOMAIN, key: "domain:old.com" }]), T0);
        const now = after(8 * 24);
        const at = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
        // One run 30 hours ago no longer counts
        await recordFleetUse(test.db, projectId, use(2, [EMAIL]), at(30));
        await recordFleetUse(test.db, projectId, use(3, [EMAIL], { agent: "support" }), at(2));
        await recordFleetUse(test.db, projectId, use(4, [DOMAIN]), at(3));
        await recordFleetUse(test.db, projectId, use(5, [DOMAIN]), at(2));
        await recordFleetUse(test.db, projectId, use(6, [DOMAIN]), at(1));
        await recordFleetUse(test.db, projectId, use(7, [IBAN]), at(1));
        await markValueKnown(test.db, projectId, IBAN.key, "dana@acme.com");
        const busy = { ...DOMAIN, key: "domain:busy.com" };
        for (let n = 8; n <= 12; n += 1) {
            await recordFleetUse(test.db, projectId, use(n, [busy]), at(1));
        }

        const items = await listWatched(test.db, projectId, now);

        expect(items.map((item) => item.key)).toEqual([DOMAIN.key, EMAIL.key]);
        expect(items[0]).toMatchObject({ runs: 3, agents: ["billing"] });
        expect(items[1]).toEqual({
            kind: "email",
            field: "to",
            key: EMAIL.key,
            value: "j…@evil.com",
            hash: "f".repeat(32),
            firstSeenAt: at(30),
            runs: 1,
            agents: ["billing", "support"],
            lastSeenAt: at(2),
        });
    });

    it("uses the current time by default", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [IBAN]));

        expect(await listWatched(test.db, projectId)).toMatchObject([{ key: IBAN.key, runs: 1 }]);
    });
});

describe("fleetFields", () => {
    it("lists the fields the check has seen values in", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [IBAN, EMAIL, DOMAIN, { ...DOMAIN, key: "domain:b.com" }]), T0);

        expect(await fleetFields(test.db, projectId)).toEqual(["iban", "to", "url"]);
        expect(await fleetFields(test.db, await createProject(test.db, "Other"))).toEqual([]);
    });
});
