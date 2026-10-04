import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blockedRun, replay, verdict } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimIncidentJob } from "./jobs.ts";
import { getIncident } from "./list.ts";
import { failFind, saveReplay, saveVerdict } from "./save.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

async function job(id: string) {
    return test.db
        .selectFrom("incidents")
        .select(["leased_until as leasedUntil", "attempts", "errors", "damage_step_id as damageStepId"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

// A leased incident whose verdict is found
async function claimed(found = false): Promise<{ projectId: string; id: string }> {
    const projectId = await createProject(test.db, "Acme");
    const id = await blockedRun(test.db, projectId);
    if (found) {
        await saveVerdict(test.db, projectId, id, verdict());
    }
    await test.db
        .updateTable("incidents")
        .set({ leased_until: new Date(Date.now() + 60_000), attempts: 3, errors: 2 })
        .where("id", "=", id)
        .execute();
    return { projectId, id };
}

describe("saveVerdict", () => {
    it("stores the verdict and the fields lists filter on, and frees the row", async () => {
        const { projectId, id } = await claimed();
        const found = verdict();

        await saveVerdict(test.db, projectId, id, found);

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            findState: "done",
            findError: null,
            verdict: found,
            category: "bad input",
            damageTool: "payInvoice",
            damageAgent: "billing",
            entryAgent: "researcher",
            entryOrigin: "web:acme-billing.net",
            entryTrust: "untrusted",
            turningAgent: "planner",
        });
        expect(await job(id)).toEqual({ leasedUntil: null, attempts: 0, errors: 0, damageStepId: found.damage.stepId });
        expect(await claimIncidentJob(test.db, 1000)).toBeUndefined();
    });
});

describe("failFind", () => {
    it("records why the verdict could not be found", async () => {
        const { projectId, id } = await claimed();

        await failFind(test.db, projectId, id, "The blocked call's events never arrived");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            findState: "failed",
            findError: "The blocked call's events never arrived",
            verdict: null,
        });
        expect(await job(id)).toMatchObject({ leasedUntil: null, attempts: 0, errors: 0 });
    });
});

describe("saveReplay", () => {
    it("keeps the lease while running and frees it at the end", async () => {
        const { projectId, id } = await claimed(true);
        const round = {
            with: { runs: 5, harmful: 5 },
            without: { runs: 5, harmful: 0 },
            pValue: 0.004,
            costUsd: 0.4,
            finishedAt: "2026-10-04T10:00:00.000Z",
        };

        await saveReplay(test.db, projectId, id, replay({ rounds: [round] }), 0.45, "running");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ replayState: "running", spentUsd: 0.45 });
        const running = await job(id);
        expect(running.leasedUntil?.getTime()).toBeGreaterThan(Date.now() + 5 * 60_000);
        expect(running).toMatchObject({ attempts: 3, errors: 2 });

        await saveReplay(test.db, projectId, id, replay({ rounds: [round], outcome: "confirmed" }), 0.45, "done", 1);
        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            replayState: "done",
            replay: { rounds: [round], outcome: "confirmed" },
        });
        expect(await job(id)).toMatchObject({ leasedUntil: null, attempts: 0, errors: 0 });
    });

    it("stores a failed replay with its error", async () => {
        const { projectId, id } = await claimed(true);
        const failed = replay({ error: "Set OPENAI_API_KEY on the worker to run replay" });

        await saveReplay(test.db, projectId, id, failed, 0, "failed");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({ replayState: "failed", replay: failed });
    });
});
