import { getIncident } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { STEP } from "../test/attack.ts";
import { claim, storeAttack } from "../test/db.ts";
import { IBAN_KEY } from "../test/runs.ts";
import { NEVER_ARRIVED, runFind } from "./find.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// Claims see every project, so each test starts with no incidents
beforeEach(async () => {
    await test.db.deleteFrom("incidents").execute();
});

const deps = () => ({ db: test.db, openai: undefined });

describe("runFind", () => {
    it("stores the verdict of the M1 attack", async () => {
        const { projectId, id } = await storeAttack(test.db);

        expect(await runFind(deps(), await claim(test.db))).toBe("verdict: bad input");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            findState: "done",
            category: "bad input",
            entryOrigin: "web:invoices.evil-pay.com",
            verdict: {
                entry: { stepId: STEP.fetch, contentId: "c2", key: IBAN_KEY },
                turning: { stepId: STEP.decide },
                damage: { stepId: STEP.pay, tool: "payInvoice", ran: false },
                missingGuard: null,
                versions: [{ agent: "billing", version: "1".repeat(16) }],
            },
        });
    });

    it("finds a payment that ran by its decision, and names the rule in observe mode", async () => {
        const { projectId, id } = await storeAttack(test.db, { mode: "observe" });

        await runFind(deps(), await claim(test.db));

        expect((await getIncident(test.db, projectId, id))?.verdict).toMatchObject({
            damage: { ran: true },
            missingGuard: { tool: "payInvoice", guard: "action", rule: "iban:from", observe: true },
        });
    });

    it("waits when the blocked call is not stored yet", async () => {
        const { projectId, id } = await storeAttack(test.db);
        await test.db.deleteFrom("steps").where("project_id", "=", projectId).where("step_id", "=", STEP.pay).execute();

        expect(await runFind(deps(), await claim(test.db))).toBe("waiting for the run's events");

        const row = await test.db
            .selectFrom("incidents")
            .select(["find_state", "leased_until", "run_after"])
            .where("id", "=", id)
            .executeTakeFirstOrThrow();
        expect(row).toMatchObject({ find_state: "pending", leased_until: null });
        expect(row.run_after.getTime()).toBeGreaterThan(Date.now());
    });

    it("waits when the run is not stored", async () => {
        const { projectId, id } = await storeAttack(test.db);
        const job = await claim(test.db);

        expect(await runFind(deps(), { ...job, runId: "b".repeat(32) })).toBe("waiting for the run's events");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ findState: "pending" });
    });

    it("gives up after five minutes of waiting", async () => {
        const { projectId, id } = await storeAttack(test.db);
        await test.db.deleteFrom("steps").where("project_id", "=", projectId).execute();
        const job = await claim(test.db);

        expect(await runFind(deps(), { ...job, attempts: 60 })).toBe(`failed: ${NEVER_ARRIVED}`);
        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            findState: "failed",
            findError: NEVER_ARRIVED,
        });
    });
});
