import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunItem } from "./ingest/rows.ts";
import { requestInput, waiterInput } from "../test/approvals.ts";
import { item, modelCall } from "../test/events.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { decideApproval } from "./approvals/decide.ts";
import { openApprovalRequest } from "./approvals/requests.ts";
import { addWaiter } from "./approvals/waiters.ts";
import { ingestBatch } from "./ingest/store.ts";
import { createProject } from "./projects.ts";
import { listRuns, type RunListItem } from "./runs.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((char) => char.repeat(32)) as [
    string,
    string,
    string,
    string,
    string,
];
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 3, hour, minute));
const ids = (runs: RunListItem[]) => runs.map((run) => run.runId);

const started = (runId: string, agent: string, hour: number): RunItem["event"] => ({
    type: "run_started",
    runId,
    agent,
    at: at(hour).toISOString(),
    origins: {},
});

describe("listRuns by agent", () => {
    it("keeps the runs an agent took part in, before the limit", async () => {
        const projectId = await createProject(test.db, "Acme");
        const delegated = { ...modelCall(at(10, 1).toISOString()), runId: a, agent: "researcher" };
        await ingestBatch(test.db, projectId, [
            item(started(a, "billing", 10)),
            item(delegated),
            item(started(b, "support", 11)),
            item(started(c, "billing", 12)),
        ]);

        expect(ids(await listRuns(test.db, projectId, { agent: "researcher" }))).toEqual([a]);
        expect(ids(await listRuns(test.db, projectId, { agent: "billing" }))).toEqual([c, a]);
        expect(ids(await listRuns(test.db, projectId, { agent: "support", limit: 1 }))).toEqual([b]);
        expect(await listRuns(test.db, projectId, { agent: "nobody" })).toEqual([]);
    });
});

describe("listRuns of waiting runs", () => {
    async function beat(projectId: string, runId: string, lastBeatAt: Date): Promise<void> {
        await test.db
            .updateTable("approval_waiters")
            .set({ last_beat_at: lastBeatAt })
            .where("project_id", "=", projectId)
            .where("run_id", "=", runId)
            .execute();
    }

    it("keeps open runs with a call on an open request that beat since then, before the limit", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started(a, "billing", 9)),
            item(started(b, "billing", 10)),
            item(started(c, "billing", 11)),
            item({ type: "run_finished", runId: c, agent: "billing", at: at(11, 5).toISOString(), status: "failed" }),
            item(started(d, "billing", 12)),
            item(started(e, "billing", 13)),
        ]);
        const open = await openApprovalRequest(test.db, projectId, requestInput());
        const answered = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "1".repeat(32) }));
        for (const runId of [a, b, c]) {
            await addWaiter(test.db, projectId, waiterInput(open.id, { runId }));
        }
        await addWaiter(test.db, projectId, waiterInput(answered.id, { runId: d }));
        await decideApproval(test.db, projectId, answered.id, "deny", "dana@acme.com");
        const now = at(20);
        for (const runId of [a, c, d]) {
            await beat(projectId, runId, now);
        }
        // Quiet for longer than the cut off
        await beat(projectId, b, at(19));

        const since = at(19, 59);
        expect(ids(await listRuns(test.db, projectId, { beatSince: since }))).toEqual([a]);
        expect(ids(await listRuns(test.db, projectId, { beatSince: since, limit: 1 }))).toEqual([a]);
        expect(ids(await listRuns(test.db, projectId, { beatSince: at(18) }))).toEqual([b, a]);
    });
});
