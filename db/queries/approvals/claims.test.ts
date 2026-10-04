import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../connect/connect.ts";
import { askId, HASH, requestInput, waiterInput } from "../../test/approvals.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimOnce, claimRequest, findActiveGrant, useGrant } from "./claims.ts";
import { decideApproval, revokeGrant } from "./decide.ts";
import { getApprovalRequest, openApprovalRequest } from "./requests.ts";
import { addWaiter, finishWaiters } from "./waiters.ts";

let test: TestDb;
// A pool with several connections, for calls that race
let many: Db;

beforeAll(async () => {
    test = await startTestDb();
    many = connect(test.url, 4);
}, 60_000);

afterAll(async () => {
    await many.destroy();
    await test.stop();
});

const call = { agent: "billing", tool: "payInvoice", argsHash: HASH };
// Far older than the stale limit
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

// Calls that wait on a request, the first one longest, each still beating
async function waitOn(projectId: string, requestId: string, count: number): Promise<string[]> {
    const askIds: string[] = [];
    for (let n = 0; n < count; n += 1) {
        const waiter = waiterInput(requestId);
        await addWaiter(test.db, projectId, waiter);
        await test.db
            .updateTable("approval_waiters")
            .set({ since: new Date(Date.UTC(2026, 9, 3, 12, n)) })
            .where("ask_id", "=", waiter.askId)
            .execute();
        askIds.push(waiter.askId);
    }
    return askIds;
}

// The call stopped beating long ago
async function stopBeating(askId: string): Promise<void> {
    await test.db.updateTable("approval_waiters").set({ last_beat_at: LONG_AGO }).where("ask_id", "=", askId).execute();
}

// The call comes from another run than the request's own call
async function fromRun(askId: string, runId: string): Promise<void> {
    await test.db.updateTable("approval_waiters").set({ run_id: runId }).where("ask_id", "=", askId).execute();
}

// Opens a request for the payInvoice call and answers it
async function decided(projectId: string, answer: "once" | "always" | "deny", argsHash = HASH): Promise<string> {
    const { id } = await openApprovalRequest(test.db, projectId, requestInput({ argsHash }));
    await decideApproval(test.db, projectId, id, answer, "dana@acme.com");
    return id;
}

describe("findActiveGrant and useGrant", () => {
    it("find an always approval, count its uses, and stop after a revoke", async () => {
        const projectId = await createProject(test.db, "Acme");
        await decided(projectId, "always");

        const grant = await findActiveGrant(test.db, projectId, "billing", "payInvoice", HASH);
        expect(grant?.id).toMatch(/^grt_[0-9a-f]{16}$/);
        const id = String(grant?.id);
        expect(await useGrant(test.db, projectId, id)).toBe(true);
        expect(await useGrant(test.db, projectId, id)).toBe(true);
        const row = await test.db.selectFrom("approval_grants").selectAll().where("id", "=", id).executeTakeFirst();
        expect(row).toMatchObject({ times_used: 2, last_used_at: expect.any(Date) });

        expect(await findActiveGrant(test.db, projectId, "support", "payInvoice", HASH)).toBeUndefined();
        expect(await findActiveGrant(test.db, projectId, "billing", "refund", HASH)).toBeUndefined();
        expect(await findActiveGrant(test.db, projectId, "billing", "payInvoice", "e".repeat(32))).toBeUndefined();

        await revokeGrant(test.db, projectId, id, "li.wei@acme.com");
        expect(await findActiveGrant(test.db, projectId, "billing", "payInvoice", HASH)).toBeUndefined();
        expect(await useGrant(test.db, projectId, id)).toBe(false);
    });
});

describe("claimOnce", () => {
    it("gives an unused approve once to the next identical call, oldest decision first", async () => {
        const projectId = await createProject(test.db, "Acme");
        const later = await decided(projectId, "once");
        const earlier = await decided(projectId, "once");
        await test.db
            .updateTable("approval_requests")
            .set({ decided_at: new Date("2026-10-01T00:00:00.000Z") })
            .where("id", "=", earlier)
            .execute();
        const first = askId();
        const second = askId();

        expect(await claimOnce(test.db, projectId, { ...call, askId: first })).toBe(earlier);
        expect(await claimOnce(test.db, projectId, { ...call, askId: second })).toBe(later);
        expect(await claimOnce(test.db, projectId, { ...call, askId: askId() })).toBeUndefined();
        expect(await getApprovalRequest(test.db, projectId, earlier)).toMatchObject({
            usedBy: first,
            usedAt: expect.any(Date),
        });
    });

    it("leaves an approve once to the calls that wait on it, until they stop beating", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id: waited } = await openApprovalRequest(test.db, projectId, requestInput());
        const [waiting] = await waitOn(projectId, waited, 1);
        await decideApproval(test.db, projectId, waited, "once", "dana@acme.com");
        const { id: left } = await openApprovalRequest(test.db, projectId, requestInput());
        const [done] = await waitOn(projectId, left, 1);
        await finishWaiters(test.db, projectId, [done!]);
        await decideApproval(test.db, projectId, left, "once", "dana@acme.com");

        expect(await claimOnce(test.db, projectId, { ...call, askId: askId() })).toBe(left);
        expect(await claimOnce(test.db, projectId, { ...call, askId: askId() })).toBeUndefined();
        await stopBeating(waiting!);
        expect(await claimOnce(test.db, projectId, { ...call, askId: askId() })).toBe(waited);
    });

    it("gives a call the request it already has", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await decided(projectId, "once");
        const ask = askId();

        expect(await claimOnce(test.db, projectId, { ...call, askId: ask })).toBe(id);
        expect(await claimOnce(test.db, projectId, { ...call, askId: ask })).toBe(id);
    });

    it("skips open, denied and always requests, other calls and other projects", async () => {
        const projectId = await createProject(test.db, "Acme");
        await openApprovalRequest(test.db, projectId, requestInput());
        await decided(projectId, "deny", "e".repeat(32));
        await decided(projectId, "always", "f".repeat(32));
        await decided(projectId, "once", "a".repeat(32));
        const other = await createProject(test.db, "Other");

        for (const argsHash of [HASH, "e".repeat(32), "f".repeat(32)]) {
            expect(await claimOnce(test.db, projectId, { ...call, argsHash, askId: askId() })).toBeUndefined();
        }
        const changed = { ...call, argsHash: "a".repeat(32), askId: askId() };
        expect(await claimOnce(test.db, projectId, { ...changed, agent: "support" })).toBeUndefined();
        expect(await claimOnce(test.db, projectId, { ...changed, tool: "refund" })).toBeUndefined();
        expect(await claimOnce(test.db, other, changed)).toBeUndefined();
    });

    it("lets only one of two calls at the same time take a single approve once", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await decided(projectId, "once");

        const claims = await Promise.all(
            [askId(), askId(), askId()].map((ask) => claimOnce(many, projectId, { ...call, askId: ask })),
        );

        expect(claims.filter((claim) => claim === id)).toHaveLength(1);
        expect(claims.filter((claim) => claim === undefined)).toHaveLength(2);
    });

    it("gives two calls at the same time two different approvals", async () => {
        const projectId = await createProject(test.db, "Acme");
        const ids = [await decided(projectId, "once"), await decided(projectId, "once")];

        const claims = await Promise.all(
            [askId(), askId()].map((ask) => claimOnce(many, projectId, { ...call, askId: ask })),
        );

        expect(claims.sort()).toEqual(ids.sort());
    });
});

describe("claimRequest", () => {
    it("claims a decided approve once for one call only", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const ask = askId();
        expect(await claimRequest(test.db, projectId, id, ask)).toBe("used");
        await decideApproval(test.db, projectId, id, "once", "dana@acme.com");

        expect(await claimRequest(test.db, projectId, id, ask)).toBe("runs");
        const usedAt = (await getApprovalRequest(test.db, projectId, id))?.usedAt;
        expect(await claimRequest(test.db, projectId, id, ask)).toBe("runs");
        expect((await getApprovalRequest(test.db, projectId, id))?.usedAt).toEqual(usedAt);
        expect(await claimRequest(test.db, projectId, id, askId())).toBe("used");
        expect(await claimRequest(test.db, await createProject(test.db, "Other"), id, ask)).toBe("used");
    });

    it("never claims a deny or an always", async () => {
        const projectId = await createProject(test.db, "Acme");
        const denied = await decided(projectId, "deny");
        const always = await decided(projectId, "always", "e".repeat(32));

        expect(await claimRequest(test.db, projectId, denied, askId())).toBe("used");
        expect(await claimRequest(test.db, projectId, always, askId())).toBe("used");
    });

    it("lets only one of two calls at the same time claim it", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await decided(projectId, "once");

        const claims = await Promise.all([askId(), askId()].map((ask) => claimRequest(many, projectId, id, ask)));

        expect(claims.sort()).toEqual(["runs", "used"]);
    });

    it("gives it to the call that waits longest while it still beats, and makes the others wait", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const [first, second] = await waitOn(projectId, id, 2);
        await decideApproval(test.db, projectId, id, "once", "dana@acme.com");

        expect(await claimRequest(test.db, projectId, id, second!)).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, askId())).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, first!)).toBe("runs");
        expect(await claimRequest(test.db, projectId, id, second!)).toBe("used");
    });

    it("passes over calls ahead that stopped beating or waiting, but not one that asks itself", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const [gone, done, next, last] = await waitOn(projectId, id, 4);
        await stopBeating(gone!);
        await finishWaiters(test.db, projectId, [done!]);
        await stopBeating(last!);
        await decideApproval(test.db, projectId, id, "once", "dana@acme.com");

        expect(await claimRequest(test.db, projectId, id, last!)).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, gone!)).toBe("runs");
        expect(await claimRequest(test.db, projectId, id, next!)).toBe("used");
    });

    it("gives it to the request's own call while it beats, before a call that waits longer", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        // The first call came over from an earlier request and kept its wait
        const [moved, own] = await waitOn(projectId, id, 2);
        await fromRun(moved!, "e".repeat(32));
        await decideApproval(test.db, projectId, id, "once", "dana@acme.com");

        expect(await claimRequest(test.db, projectId, id, moved!)).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, own!)).toBe("runs");
        expect(await claimRequest(test.db, projectId, id, moved!)).toBe("used");
    });

    it("goes by the longest wait once the request's own call stopped beating", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const [moved, own, joined] = await waitOn(projectId, id, 3);
        await fromRun(moved!, "e".repeat(32));
        await fromRun(joined!, "f".repeat(32));
        await decideApproval(test.db, projectId, id, "once", "dana@acme.com");

        expect(await claimRequest(test.db, projectId, id, joined!)).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, moved!)).toBe("waits");
        await stopBeating(own!);
        expect(await claimRequest(test.db, projectId, id, joined!)).toBe("waits");
        expect(await claimRequest(test.db, projectId, id, moved!)).toBe("runs");
    });
});
