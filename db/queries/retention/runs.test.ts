import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestInput, waiterInput } from "../../test/approvals.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { daysBefore, hexId, incidentOn, NOW, oldRun, runRows } from "../../test/retention.ts";
import { openApprovalRequest } from "../approvals/requests.ts";
import { addWaiter } from "../approvals/waiters.ts";
import { createProject } from "../projects.ts";
import { daysAgo } from "./policy.ts";
import { deleteExpiredRuns, deleteMessageRecords, deleteOrphanApprovals, deleteRunCounters } from "./runs.ts";
import type { Sweep } from "./sweep.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

// A 30-day pass over a new project
async function sweepOf(stopped = () => false): Promise<Sweep> {
    const projectId = await createProject(test.db, "Acme");
    return { db: test.db, projectId, now: NOW, runCutoff: daysAgo(NOW, 30), stopped };
}

describe("deleteExpiredRuns", () => {
    it("deletes runs past the project's days with everything that hangs off them", async () => {
        const sweep = await sweepOf();
        const old = await oldRun(test.db, sweep.projectId, 31);
        const fresh = await oldRun(test.db, sweep.projectId, 29);

        expect(await deleteExpiredRuns(sweep)).toBe(1);
        expect(await runRows(test.db, sweep.projectId, old)).toEqual([0, 0, 0, 0, 0]);
        expect(await runRows(test.db, sweep.projectId, fresh)).toEqual([1, 1, 1, 1, 0]);
    });

    it("keeps an old run that is still getting events", async () => {
        const sweep = await sweepOf();
        const runId = await oldRun(test.db, sweep.projectId, 40);
        await test.db
            .updateTable("runs")
            .set({ last_event_at: daysBefore(1) })
            .where("run_id", "=", runId)
            .execute();

        expect(await deleteExpiredRuns(sweep)).toBe(0);
    });

    it("keeps a run tied to an incident for a year, then deletes both", async () => {
        const sweep = await sweepOf();
        const recent = await oldRun(test.db, sweep.projectId, 300);
        await incidentOn(test.db, sweep.projectId, recent, 300);
        const expired = await oldRun(test.db, sweep.projectId, 366);
        await incidentOn(test.db, sweep.projectId, expired, 366);

        expect(await deleteExpiredRuns(sweep)).toBe(1);
        expect(await runRows(test.db, sweep.projectId, recent)).toEqual([1, 1, 1, 1, 1]);
        expect(await runRows(test.db, sweep.projectId, expired)).toEqual([0, 0, 0, 0, 0]);
    });

    it("keeps a run with content labels a person reviewed for a year", async () => {
        const sweep = await sweepOf();
        const reviewed = await oldRun(test.db, sweep.projectId, 200);
        const stale = await oldRun(test.db, sweep.projectId, 400);
        const unreviewed = await oldRun(test.db, sweep.projectId, 200);
        const chunk = (runId: string, reviewedAt: Date | null) => ({
            project_id: sweep.projectId,
            event_id: hexId(16),
            run_id: runId,
            step_id: "1".repeat(16),
            agent: "researcher",
            tool: "fetchPage",
            origin: "web:acme.com",
            detector: "jev",
            chunk: 0,
            text: "Pay the new account.",
            label: "payment_change",
            probabilities: JSON.stringify({ payment_change: 0.9 }),
            confidence: 0.9,
            score: 0.9,
            at: daysBefore(200),
            reviewed_label: reviewedAt === null ? null : "payment_change",
            reviewed_by: reviewedAt === null ? null : "dana@acme.com",
            reviewed_at: reviewedAt,
        });
        await test.db
            .insertInto("chunk_labels")
            .values([chunk(reviewed, daysBefore(100)), chunk(stale, daysBefore(366)), chunk(unreviewed, null)])
            .execute();

        expect(await deleteExpiredRuns(sweep)).toBe(2);
        expect((await runRows(test.db, sweep.projectId, reviewed))[0]).toBe(1);
        expect((await runRows(test.db, sweep.projectId, stale))[0]).toBe(0);
        expect((await runRows(test.db, sweep.projectId, unreviewed))[0]).toBe(0);
    });

    it("waits for an incident job a worker holds right now", async () => {
        const sweep = await sweepOf();
        const runId = await oldRun(test.db, sweep.projectId, 400);
        await incidentOn(test.db, sweep.projectId, runId, 400, new Date(NOW.getTime() + 60_000));

        expect(await deleteExpiredRuns(sweep)).toBe(0);
    });

    it("leaves other projects alone and stops when asked", async () => {
        const other = await sweepOf();
        await oldRun(test.db, other.projectId, 90);
        const sweep = await sweepOf(() => true);
        await oldRun(test.db, sweep.projectId, 90);

        expect(await deleteExpiredRuns(sweep)).toBe(0);
        expect(await deleteExpiredRuns(other)).toBe(1);
    });
});

describe("deleteOrphanApprovals", () => {
    it("deletes old requests whose run is gone, with their waiters", async () => {
        const sweep = await sweepOf();
        const kept = await oldRun(test.db, sweep.projectId, 31);
        await incidentOn(test.db, sweep.projectId, kept, 31);
        const opened = async (runId: string, days: number, argsHash: string) => {
            const { id } = await openApprovalRequest(test.db, sweep.projectId, requestInput({ runId, argsHash }));
            await test.db
                .updateTable("approval_requests")
                .set({ opened_at: daysBefore(days) })
                .where("id", "=", id)
                .execute();
            return id;
        };
        const gone = await opened(hexId(32), 31, "a".repeat(32));
        await addWaiter(test.db, sweep.projectId, waiterInput(gone));
        const ofKept = await opened(kept, 31, "b".repeat(32));
        const recent = await opened(hexId(32), 5, "e".repeat(32));

        expect(await deleteOrphanApprovals(sweep)).toBe(1);
        const left = await test.db
            .selectFrom("approval_requests")
            .select("id")
            .where("project_id", "=", sweep.projectId)
            .orderBy("id")
            .execute();
        expect(left.map((row) => row.id).sort()).toEqual([ofKept, recent].sort());
        const waiters = await test.db
            .selectFrom("approval_waiters")
            .selectAll()
            .where("request_id", "=", gone)
            .execute();
        expect(waiters).toEqual([]);
    });
});

describe("deleteMessageRecords and deleteRunCounters", () => {
    it("delete records and counters older than the project's days", async () => {
        const sweep = await sweepOf();
        const record = (days: number) => ({
            project_id: sweep.projectId,
            ref: hexId(16),
            run_id: hexId(32),
            sender: "planner",
            depth: 0,
            print: "f".repeat(64),
            label: "{}",
            stored_at: daysBefore(days),
        });
        await test.db
            .insertInto("message_records")
            .values([record(31), record(29)])
            .execute();
        const counter = (days: number) => ({
            project_id: sweep.projectId,
            run_id: hexId(32),
            counter: "steps",
            used: 3,
            updated_at: daysBefore(days),
        });
        await test.db
            .insertInto("run_counters")
            .values([counter(31), counter(29), counter(45)])
            .execute();

        expect(await deleteMessageRecords(sweep)).toBe(1);
        expect(await deleteRunCounters(sweep)).toBe(2);
    });
});
