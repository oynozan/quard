import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { askId, HASH, requestInput, RULES, RUN, STEP, waiterInput } from "../../test/approvals.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimRequest } from "./claims.ts";
import { decideApproval, revokeGrant } from "./decide.ts";
import { countOpenRequests, getOpenRequest, listDecidedRequests, listGrants, listOpenRequests } from "./list.ts";
import { openApprovalRequest } from "./requests.ts";
import { addWaiter, finishWaiters } from "./waiters.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const at = (minute: number) => new Date(Date.UTC(2026, 9, 3, 12, minute));
// Far older than the stale limit
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

async function setTimes(table: "approval_requests" | "approval_grants", id: string, times: Record<string, Date>) {
    await test.db.updateTable(table).set(times).where("id", "=", id).execute();
}

type Waiting = "live" | "stale" | "done" | "none";

// Opens a request at `minute` with one call in the given state
async function openAt(projectId: string, minute: number, waiting: Waiting): Promise<string> {
    const argsHash = minute.toString(16).padStart(32, "0");
    const { id } = await openApprovalRequest(test.db, projectId, requestInput({ argsHash }));
    await setTimes("approval_requests", id, { opened_at: at(minute) });
    if (waiting === "none") {
        return id;
    }
    const waiter = waiterInput(id);
    await addWaiter(test.db, projectId, waiter);
    if (waiting === "stale") {
        await test.db
            .updateTable("approval_waiters")
            .set({ last_beat_at: LONG_AGO })
            .where("ask_id", "=", waiter.askId)
            .execute();
    } else if (waiting === "done") {
        await finishWaiters(test.db, projectId, [waiter.askId]);
    }
    return id;
}

describe("listOpenRequests", () => {
    it("lists open requests, each with the calls waiting on it", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();
        const older = await openApprovalRequest(test.db, projectId, input);
        const newer = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        const decided = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "f".repeat(32) }));
        await setTimes("approval_requests", older.id, { opened_at: at(1) });
        await setTimes("approval_requests", newer.id, { opened_at: at(2) });
        await decideApproval(test.db, projectId, decided.id, "deny", "dana@acme.com");
        const first = waiterInput(older.id);
        const joined = waiterInput(older.id, { runId: "9".repeat(32), stepId: "8".repeat(16), agent: "billing-2" });
        await addWaiter(test.db, projectId, joined);
        await addWaiter(test.db, projectId, first);
        await test.db
            .updateTable("approval_waiters")
            .set({ since: at(1) })
            .where("ask_id", "=", first.askId)
            .execute();
        await test.db
            .updateTable("approval_waiters")
            .set({ since: at(3) })
            .where("ask_id", "=", joined.askId)
            .execute();
        await finishWaiters(test.db, projectId, [joined.askId]);

        const open = await listOpenRequests(test.db, projectId);

        expect(open.map((request) => request.id)).toEqual([older.id, newer.id]);
        expect(open[1]?.waiters).toEqual([]);
        expect(open[0]).toEqual({
            id: older.id,
            runId: RUN,
            stepId: STEP,
            agent: "billing",
            tool: "payInvoice",
            argsHash: HASH,
            args: input.args,
            masked: input.masked,
            labels: input.labels,
            context: input.context,
            reasons: input.reasons,
            rulesHash: RULES,
            openedAt: at(1),
            waiters: [
                {
                    askId: first.askId,
                    runId: RUN,
                    stepId: STEP,
                    agent: "billing",
                    since: at(1),
                    lastBeatAt: expect.any(Date),
                    doneAt: null,
                },
                {
                    askId: joined.askId,
                    runId: "9".repeat(32),
                    stepId: "8".repeat(16),
                    agent: "billing-2",
                    since: at(3),
                    lastBeatAt: expect.any(Date),
                    doneAt: expect.any(Date),
                },
            ],
        });
    });

    it("is empty when nothing waits, and keeps projects apart", async () => {
        const projectId = await createProject(test.db, "Acme");
        await openApprovalRequest(test.db, projectId, requestInput());

        expect(await listOpenRequests(test.db, await createProject(test.db, "Other"))).toEqual([]);
    });

    it("puts calls that still wait first, the longest wait on top, and never cuts them at the limit", async () => {
        const projectId = await createProject(test.db, "Acme");
        const left = await openAt(projectId, 1, "none");
        const live = await openAt(projectId, 2, "live");
        const done = await openAt(projectId, 3, "done");
        const stale = await openAt(projectId, 4, "stale");
        const newest = await openAt(projectId, 5, "live");
        const ids = async (limit?: number) =>
            (await listOpenRequests(test.db, projectId, limit)).map((request) => request.id);

        expect(await ids()).toEqual([live, newest, left, done, stale]);
        expect(await ids(3)).toEqual([live, newest, left]);
        expect(await ids(1)).toEqual([live, newest]);
    });
});

describe("getOpenRequest", () => {
    it("reads one open request with the calls waiting on it, in this project only", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await openAt(projectId, 1, "live");
        const decided = await openAt(projectId, 2, "none");
        await decideApproval(test.db, projectId, decided, "deny", "dana@acme.com");

        expect(await getOpenRequest(test.db, projectId, id)).toMatchObject({
            id,
            args: requestInput().args,
            openedAt: at(1),
            waiters: [{ doneAt: null }],
        });
        expect(await getOpenRequest(test.db, projectId, decided)).toBeUndefined();
        expect(await getOpenRequest(test.db, await createProject(test.db, "Other"), id)).toBeUndefined();
    });
});

describe("countOpenRequests", () => {
    it("counts the requests that wait for an answer, in this project only", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        expect(await countOpenRequests(test.db, projectId)).toBe(0);

        await openApprovalRequest(test.db, projectId, requestInput());
        await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        const decided = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "f".repeat(32) }));
        await decideApproval(test.db, projectId, decided.id, "deny", "dana@acme.com");
        await openApprovalRequest(test.db, other, requestInput());

        expect(await countOpenRequests(test.db, projectId)).toBe(2);
        expect(await countOpenRequests(test.db, other)).toBe(1);
    });
});

describe("listGrants", () => {
    it("lists always approvals newest first, revoked ones included", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();
        const old = await openApprovalRequest(test.db, projectId, input);
        await decideApproval(test.db, projectId, old.id, "always", "dana@acme.com");
        const [revoked] = await listGrants(test.db, projectId);
        await revokeGrant(test.db, projectId, String(revoked?.id), "li.wei@acme.com");
        await setTimes("approval_grants", String(revoked?.id), { approved_at: at(1) });
        const fresh = await openApprovalRequest(test.db, projectId, input);
        await decideApproval(test.db, projectId, fresh.id, "always", "marco@acme.com");

        const grants = await listGrants(test.db, projectId);

        expect(grants.map((grant) => grant.approvedBy)).toEqual(["marco@acme.com", "dana@acme.com"]);
        expect(grants[0]).toEqual({
            id: expect.stringMatching(/^grt_/),
            requestId: fresh.id,
            agent: "billing",
            tool: "payInvoice",
            argsHash: HASH,
            masked: input.masked,
            approvedBy: "marco@acme.com",
            approvedAt: expect.any(Date),
            timesUsed: 0,
            lastUsedAt: null,
            revokedAt: null,
            revokedBy: null,
        });
        expect(grants[1]).toMatchObject({ revokedAt: expect.any(Date), revokedBy: "li.wei@acme.com" });
        expect(await listGrants(test.db, await createProject(test.db, "Other"))).toEqual([]);
    });
});

describe("listDecidedRequests", () => {
    it("lists past answers newest first, with masked arguments only", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();
        const first = await openApprovalRequest(test.db, projectId, input);
        await decideApproval(test.db, projectId, first.id, "once", "dana@acme.com");
        const ask = askId();
        await claimRequest(test.db, projectId, first.id, ask);
        await setTimes("approval_requests", first.id, { decided_at: at(1) });
        const second = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        await decideApproval(test.db, projectId, second.id, "deny", "li.wei@acme.com");
        await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "f".repeat(32) }));

        const decided = await listDecidedRequests(test.db, projectId);

        expect(decided.map((item) => item.id)).toEqual([second.id, first.id]);
        expect(decided[1]).toEqual({
            id: first.id,
            runId: RUN,
            stepId: STEP,
            agent: "billing",
            tool: "payInvoice",
            argsHash: HASH,
            masked: input.masked,
            labels: input.labels,
            context: input.context,
            reasons: input.reasons,
            rulesHash: RULES,
            openedAt: expect.any(Date),
            answer: "once",
            decidedBy: "dana@acme.com",
            decidedAt: at(1),
            usedBy: ask,
            usedAt: expect.any(Date),
        });
        expect(decided[1]).not.toHaveProperty("args");
        expect((await listDecidedRequests(test.db, projectId, 1)).map((item) => item.id)).toEqual([second.id]);
    });
});
