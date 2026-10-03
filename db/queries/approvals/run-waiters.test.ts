import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HASH, requestInput, RUN, STEP, waiterInput } from "../../test/approvals.ts";
import { item, started, TOOL_STEP, toolCall } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { decideApproval } from "./decide.ts";
import { openApprovalRequest } from "./requests.ts";
import { runWaiters } from "./run-waiters.ts";
import { addWaiter, finishWaiters } from "./waiters.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const JOINED_RUN = "9".repeat(32);
const at = (minute: number) => new Date(Date.UTC(2026, 9, 3, 12, minute));

async function setTimes(askId: string, since: Date, lastBeatAt: Date): Promise<void> {
    await test.db
        .updateTable("approval_waiters")
        .set({ since, last_beat_at: lastBeatAt })
        .where("ask_id", "=", askId)
        .execute();
}

describe("runWaiters", () => {
    it("lists the calls of these runs that wait on an open request, oldest first, quiet ones too", async () => {
        const projectId = await createProject(test.db, "Acme");
        const open = await openApprovalRequest(test.db, projectId, requestInput());
        const first = waiterInput(open.id);
        const joined = waiterInput(open.id, { runId: JOINED_RUN, stepId: "8".repeat(16), agent: "billing-2" });
        await addWaiter(test.db, projectId, first);
        await addWaiter(test.db, projectId, joined);
        // Quiet long ago but still listed, since approvals never expire
        await setTimes(first.askId, at(2), at(3));
        await setTimes(joined.askId, at(1), at(30));

        expect(await runWaiters(test.db, projectId, [RUN, JOINED_RUN])).toEqual([
            {
                askId: joined.askId,
                requestId: open.id,
                runId: JOINED_RUN,
                stepId: "8".repeat(16),
                agent: "billing-2",
                tool: "payInvoice",
                argsHash: HASH,
                since: at(1),
                lastBeatAt: at(30),
                doneAt: null,
            },
            {
                askId: first.askId,
                requestId: open.id,
                runId: RUN,
                stepId: STEP,
                agent: "billing",
                tool: "payInvoice",
                argsHash: HASH,
                since: at(2),
                lastBeatAt: at(3),
                doneAt: null,
            },
        ]);
        expect((await runWaiters(test.db, projectId, [JOINED_RUN])).map((waiter) => waiter.askId)).toEqual([
            joined.askId,
        ]);
    });

    it("leaves out calls that are done, answered, already recorded, in other runs or in other projects", async () => {
        const projectId = await createProject(test.db, "Acme");
        const done = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "1".repeat(32) }));
        const denied = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "2".repeat(32) }));
        const recorded = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "3".repeat(32) }));
        const elsewhere = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "4".repeat(32) }));
        const finished = waiterInput(done.id);
        await addWaiter(test.db, projectId, finished);
        await finishWaiters(test.db, projectId, [finished.askId]);
        await addWaiter(test.db, projectId, waiterInput(denied.id));
        await decideApproval(test.db, projectId, denied.id, "deny", "dana@acme.com");
        // The tool call is stored, so this call stopped waiting even though control never heard
        await ingestBatch(test.db, projectId, [item(started()), item(toolCall())]);
        await addWaiter(test.db, projectId, waiterInput(recorded.id, { stepId: TOOL_STEP }));
        await addWaiter(test.db, projectId, waiterInput(elsewhere.id, { runId: JOINED_RUN }));
        const other = await createProject(test.db, "Other");
        const theirs = await openApprovalRequest(test.db, other, requestInput());
        await addWaiter(test.db, other, waiterInput(theirs.id));

        expect(await runWaiters(test.db, projectId, [RUN])).toEqual([]);
        expect(await runWaiters(test.db, projectId, [])).toEqual([]);
    });
});
