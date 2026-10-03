import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { after, DOMAIN, IBAN, T0, use } from "../../../test/fleet.ts";
import { listeningDb, settle } from "../../../test/notify.ts";
import { startTestDb, type TestDb } from "../../../test/pglite.ts";
import { createProject } from "../../projects.ts";
import { recordFleetUse } from "./record.ts";
import { fleetObserveUntil, markValueKnown, quarantineList } from "./state.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

async function quarantine(db: TestDb["db"], projectId: string, values = [IBAN]): Promise<void> {
    for (let n = 1; n <= 5; n += 1) {
        await recordFleetUse(db, projectId, use(n, values), after(n / 60));
    }
}

describe("quarantineList", () => {
    it("lists the project's quarantined values by key", async () => {
        const projectId = await createProject(test.db, "Acme");
        await quarantine(test.db, projectId, [IBAN, DOMAIN]);
        await recordFleetUse(test.db, await createProject(test.db, "Other"), use(1, [IBAN]), T0);

        expect(await quarantineList(test.db, projectId)).toEqual([
            { key: DOMAIN.key, observe: true },
            { key: IBAN.key, observe: true },
        ]);
    });
});

describe("fleetObserveUntil", () => {
    it("is null for a project the check has not started in, or that does not exist", async () => {
        expect(await fleetObserveUntil(test.db, await createProject(test.db, "Acme"))).toBeNull();
        expect(await fleetObserveUntil(test.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    });
});

describe("markValueKnown", () => {
    it("takes a value out of the quarantine for good, keeping who marked it first", async () => {
        const projectId = await createProject(test.db, "Acme");
        await quarantine(test.db, projectId);

        expect(await markValueKnown(test.db, projectId, IBAN.key, "dana@acme.com")).toBe(true);
        expect(await markValueKnown(test.db, projectId, IBAN.key, "li.wei@acme.com")).toBe(true);

        expect(await quarantineList(test.db, projectId)).toEqual([]);
        const row = await test.db
            .selectFrom("fleet_values")
            .selectAll()
            .where("project_id", "=", projectId)
            .executeTakeFirstOrThrow();
        expect(row).toMatchObject({
            known_at: expect.any(Date),
            known_by: "dana@acme.com",
            quarantined_at: null,
            observe: false,
        });
    });

    it("knows nothing about a value it never saw, or one in another project", async () => {
        const projectId = await createProject(test.db, "Acme");
        await recordFleetUse(test.db, projectId, use(1, [IBAN]), T0);

        expect(await markValueKnown(test.db, projectId, DOMAIN.key, "dana@acme.com")).toBe(false);
        expect(await markValueKnown(test.db, await createProject(test.db, "Other"), IBAN.key, "dana@acme.com")).toBe(
            false,
        );
    });

    it("announces a change, so control tells the SDKs", async () => {
        const listening = await listeningDb(test.url);
        try {
            const projectId = await createProject(listening.db, "Acme");
            await recordFleetUse(listening.db, projectId, use(1, [IBAN]), T0);

            await markValueKnown(listening.db, projectId, IBAN.key, "dana@acme.com");
            await markValueKnown(listening.db, projectId, DOMAIN.key, "dana@acme.com");
            await settle();

            expect(listening.heard).toEqual([{ channel: "quard_fleet", payload: projectId }]);
        } finally {
            await listening.stop();
        }
    });
});
