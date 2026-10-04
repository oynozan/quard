import { sql, type Updateable } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IncidentsTable } from "../../schema/database.ts";
import { blockedRun, replay, verdict } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimIncidentJob, deferIncidentJob, retryIncidentJob } from "./jobs.ts";
import { requestReplay } from "./replay.ts";

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
        .select([
            "find_state",
            "find_error",
            "replay_state",
            "replay",
            "leased_until",
            "run_after",
            "attempts",
            "errors",
        ])
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

    it("claims nothing after the verdict until a replay is requested", async () => {
        const id = await blockedRun(test.db, projectId);
        const found = verdict();
        await change(id, { find_state: "done", verdict: JSON.stringify(found) });

        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();

        const saved = replay();
        await change(id, { replay_state: "requested", replay: JSON.stringify(saved) });
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({
            id,
            job: "replay",
            attempts: 1,
            verdict: found,
            replay: saved,
        });
        expect((await row(id)).replay_state).toBe("running");
    });

    it("claims a running replay only after its lease ran out", async () => {
        const id = await blockedRun(test.db, projectId);
        await change(id, { find_state: "done", replay_state: "requested" });
        await claimIncidentJob(test.db, LEASE);

        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
        await change(id, { leased_until: past });
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ id, job: "replay" });
    });

    it("leaves incidents with nothing to do", async () => {
        const failed = await blockedRun(test.db, projectId);
        const replayed = await blockedRun(test.db, projectId, OTHER_RUN);
        await change(failed, { find_state: "failed" });
        await change(replayed, { find_state: "done", replay_state: "done" });

        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
    });
});

describe("the 0012 migration", () => {
    it("drops the reviewer and rebuilds the due index without it", async () => {
        const { rows: columns } = await sql<{ name: string }>`SELECT column_name AS name
            FROM information_schema.columns WHERE table_name = 'incidents'`.execute(test.db);
        const { rows: indexes } = await sql<{ def: string }>`SELECT indexdef AS def
            FROM pg_indexes WHERE indexname = 'incidents_due'`.execute(test.db);

        const names = columns.map((column) => column.name);
        expect(names).not.toContain("reviewer");
        expect(names).not.toContain("review_state");
        expect(indexes).toHaveLength(1);
        expect(indexes[0]?.def).toContain("replay_state");
        expect(indexes[0]?.def).not.toContain("review_state");
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

describe("retryIncidentJob", () => {
    const DELAYS = [15_000, 30_000];
    const leased = () => new Date(Date.now() + LEASE);

    it("frees the job to run again after a longer delay on each error in a row", async () => {
        const id = await blockedRun(test.db, projectId);
        const job = { projectId, id, job: "find" as const };
        await claimIncidentJob(test.db, LEASE);
        expect((await row(id)).errors).toBe(0);

        expect(await retryIncidentJob(test.db, job, "boom", DELAYS)).toBe(15_000);
        const first = await row(id);
        expect(first).toMatchObject({ find_state: "pending", leased_until: null, attempts: 1, errors: 1 });
        expect(first.run_after.getTime()).toBeGreaterThan(Date.now() + 10_000);
        expect(first.run_after.getTime()).toBeLessThan(Date.now() + 20_000);
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();

        await change(id, { run_after: past });
        await claimIncidentJob(test.db, LEASE);
        expect(await retryIncidentJob(test.db, job, "boom", DELAYS)).toBe(30_000);
        const second = await row(id);
        expect(second).toMatchObject({ leased_until: null, attempts: 2, errors: 2 });
        expect(second.run_after.getTime()).toBeGreaterThan(Date.now() + 25_000);
    });

    it("fails a find job with the error once no delay is left", async () => {
        const id = await blockedRun(test.db, projectId);
        await change(id, { errors: 2, attempts: 7, leased_until: leased() });

        expect(await retryIncidentJob(test.db, { projectId, id, job: "find" }, "boom", DELAYS)).toBeNull();

        expect(await row(id)).toMatchObject({
            find_state: "failed",
            find_error: "boom",
            leased_until: null,
            attempts: 0,
            errors: 0,
        });
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
    });

    it("fails a replay with the error, keeping its rounds, and lets it be asked for again", async () => {
        const id = await blockedRun(test.db, projectId);
        const round = {
            with: { runs: 5, harmful: 5 },
            without: { runs: 5, harmful: 0 },
            pValue: 0.004,
            costUsd: 0.4,
            finishedAt: "2026-10-04T10:00:00.000Z",
        };
        const saved = replay({ rounds: [round], outcome: "cap reached" });
        await change(id, {
            find_state: "done",
            verdict: JSON.stringify(verdict()),
            replay_state: "running",
            replay: JSON.stringify(saved),
            errors: 2,
            leased_until: leased(),
        });

        expect(await retryIncidentJob(test.db, { projectId, id, job: "replay" }, "boom", DELAYS)).toBeNull();

        expect(await row(id)).toMatchObject({
            find_state: "done",
            replay_state: "failed",
            replay: { ...saved, outcome: null, error: "boom" },
            leased_until: null,
            errors: 0,
        });
        expect(await claimIncidentJob(test.db, LEASE)).toBeUndefined();
        expect(await requestReplay(test.db, projectId, id, { by: "ana@acme.com" })).toBe("started");
        expect(await claimIncidentJob(test.db, LEASE)).toMatchObject({ id, job: "replay", replay: { error: null } });
    });

    it("fails a replay that threw before it saved anything, with no replay to keep", async () => {
        const id = await blockedRun(test.db, projectId);
        await change(id, { find_state: "done", replay_state: "running", errors: 2, leased_until: leased() });

        expect(await retryIncidentJob(test.db, { projectId, id, job: "replay" }, "boom", DELAYS)).toBeNull();

        expect(await row(id)).toMatchObject({ replay_state: "failed", replay: null, errors: 0 });
        expect(await requestReplay(test.db, projectId, id, { by: "ana@acme.com" })).toBe("started");
    });
});
