import type { Updateable } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IncidentsTable } from "../../schema/database.ts";
import { blockedRun, replay, verdict } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimIncidentJob, deferIncidentJob } from "./jobs.ts";

let test: TestDb;
let projectId: string;

const LEASE = 600_000;
const OTHER_RUN = "4".repeat(32);

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// Claims see every project, so each test starts with no incidents
beforeEach(async () => {
    await test.db.deleteFrom("incidents").execute();
    projectId = await createProject(test.db, "Acme");
});

async function change(id: string, fields: Updateable<IncidentsTable>) {
    await test.db.updateTable("incidents").set(fields).where("id", "=", id).execute();
}

async function row(id: string) {
    return test.db
        .selectFrom("incidents")
        .select(["replay_state", "leased_until", "run_after", "attempts"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

// A time `ms` before now
const ago = (ms: number) => new Date(Date.now() - ms);
const past = ago(1000);

describe("claimIncidentJob", () => {
    it("claims a new incident's find job and leases it", async () => {
        const id = await blockedRun(test.db, projectId);

        const job = await claimIncidentJob(test.db, LEASE);

        expect(job).toEqual({
            projectId,
            id,
            runId: "1".repeat(32),
            job: "find",
            attempts: 1,
            spentUsd: 0,
            capUsd: 5,
            verdict: null,
            replay: null,
        });
        const leased = await row(id);
        expect(leased.leased_until?.getTime()).toBeGreaterThan(Date.now() + LEASE - 60_000);
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
    });

    it("claims again once the lease ran out, counting attempts", async () => {
        const id = await blockedRun(test.db, projectId);
        await claimIncidentJob(test.db, LEASE);
        await change(id, { leased_until: past });

        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ id, job: "find", attempts: 2 });
    });

    it("takes the job that waited longest first", async () => {
        const newer = await blockedRun(test.db, projectId);
        const older = await blockedRun(test.db, projectId, OTHER_RUN);
        await change(newer, { run_after: ago(60_000) });
        await change(older, { run_after: ago(120_000) });

        expect((await claimIncidentJob(test.db, LEASE))?.id).toBe(older);
        expect((await claimIncidentJob(test.db, LEASE))?.id).toBe(newer);
    });

    it("lets workers side by side claim different incidents", async () => {
        const one = await blockedRun(test.db, projectId);
        const two = await blockedRun(test.db, projectId, OTHER_RUN);

        const jobs = await Promise.all([claimIncidentJob(test.db, LEASE), claimIncidentJob(test.db, LEASE)]);
        expect(jobs.map((job) => job?.id).sort()).toEqual([one, two].sort());
    });

    it("claims the review once the verdict is found, then a requested replay", async () => {
        const id = await blockedRun(test.db, projectId);
        const found = verdict();
        await change(id, { find_state: "done", verdict: JSON.stringify(found) });

        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ job: "review", verdict: found });

        const saved = replay();
        await change(id, { review_state: "done", leased_until: null });
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
        await change(id, { replay_state: "requested", replay: JSON.stringify(saved) });
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ job: "replay", replay: saved, attempts: 2 });
        expect((await row(id)).replay_state).toBe("running");
    });

    it("claims a running replay only after its lease ran out", async () => {
        const id = await blockedRun(test.db, projectId);
        await change(id, { find_state: "done", review_state: "skipped", replay_state: "requested" });
        await claimIncidentJob(test.db, LEASE);

        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
        await change(id, { leased_until: past });
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ id, job: "replay" });
    });

    it("leaves incidents with nothing to do", async () => {
        const failed = await blockedRun(test.db, projectId);
        const idle = await blockedRun(test.db, projectId, OTHER_RUN);
        await change(failed, { find_state: "failed" });
        await change(idle, { find_state: "done", review_state: "failed", replay_state: "done" });

        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
    });
});

describe("deferIncidentJob", () => {
    it("frees the incident until the delay passes", async () => {
        const id = await blockedRun(test.db, projectId);
        await claimIncidentJob(test.db, LEASE);

        await deferIncidentJob(test.db, projectId, id, 60_000);

        const deferred = await row(id);
        expect(deferred.leased_until).toBeNull();
        expect(deferred.run_after.getTime()).toBeGreaterThan(Date.now() + 30_000);
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();

        await change(id, { run_after: past });
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ id, attempts: 2 });
    });
});
