import { createProject, getIncident, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RunItem } from "../../../db/queries/ingest/rows.ts";
import { item } from "../../../db/test/events.ts";
import { incidentId } from "../../../db/test/incidents.ts";
import { NEVER_ARRIVED, RUN_LIMIT } from "../rootcause/damage.ts";
import { attackItems, MODEL, RUN, STEP } from "../test/attack.ts";
import { claim, storeAttack } from "../test/db.ts";
import { IBAN_KEY } from "../test/runs.ts";
import { runFind } from "./find.ts";

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

const at = (ms: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, 0, ms)).toISOString();
const block = { type: "decision", runId: RUN, agent: "billing", decision: "block" } as const;
// The attack's events with no guard decision, so the payment ran unchecked
const unchecked = () => attackItems({ mode: "observe" }).filter(({ event }) => event.type !== "decision");
const runLimit = () =>
    item({
        ...block,
        at: at(85),
        stepId: "d".repeat(16),
        tool: MODEL,
        guard: "limit",
        rule: "max-steps",
        mode: "block",
        enforced: true,
        reason: "limit_reached",
    });
const finished = () => item({ type: "run_finished", runId: RUN, agent: "billing", at: at(90), status: "blocked" });

// Stores a run's events in a new project, and returns its incident
async function store(items: RunItem[]): Promise<{ projectId: string; id: string }> {
    const projectId = await createProject(test.db, "Acme");
    await ingestBatch(test.db, projectId, items);
    return { projectId, id: incidentId(projectId, RUN) };
}

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

    it("traces a payment the x402 guard checked while a guarded tool ran", async () => {
        const payment = item({
            ...block,
            at: at(81),
            stepId: "e".repeat(16),
            tool: "wallet",
            guard: "x402",
            rule: "untrusted",
            mode: "observe",
            enforced: false,
            reason: "x402_untrusted_payee",
        });
        const { projectId, id } = await store([...unchecked(), payment]);

        expect(await runFind(deps(), await claim(test.db))).toBe("verdict: bad input");

        expect((await getIncident(test.db, projectId, id))?.verdict).toMatchObject({
            damage: { stepId: STEP.pay, tool: "payInvoice", ran: true },
            missingGuard: { tool: "payInvoice", guard: "x402", rule: "untrusted", observe: true },
        });
    });

    it("waits while a run with no tool call to trace may still send events", async () => {
        const { projectId, id } = await store([...unchecked(), runLimit()]);

        expect(await runFind(deps(), await claim(test.db))).toBe("waiting for the run's events");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ findState: "pending" });
    });

    it("fails at once with the plain reason once that run ended", async () => {
        const { projectId, id } = await store([...unchecked(), runLimit(), finished()]);

        expect(await runFind(deps(), await claim(test.db))).toBe(`failed: ${RUN_LIMIT}`);
        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            findState: "failed",
            findError: RUN_LIMIT,
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
