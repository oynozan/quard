import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestInput, waiterInput } from "../../test/approvals.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { openApprovalRequest } from "./requests.ts";
import { addWaiter, beatWaiters, finishWaiters, waiterRequest } from "./waiters.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");

async function waiterRow(projectId: string, askId: string) {
    return test.db
        .selectFrom("approval_waiters")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("ask_id", "=", askId)
        .executeTakeFirstOrThrow();
}

async function age(projectId: string, done: boolean): Promise<void> {
    await test.db
        .updateTable("approval_waiters")
        .set({ since: LONG_AGO, last_beat_at: LONG_AGO, done_at: done ? LONG_AGO : null })
        .where("project_id", "=", projectId)
        .execute();
}

describe("addWaiter", () => {
    it("adds a waiting call", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const waiter = waiterInput(id);

        await addWaiter(test.db, projectId, waiter);

        expect(await waiterRow(projectId, waiter.askId)).toMatchObject({
            request_id: id,
            run_id: waiter.runId,
            step_id: waiter.stepId,
            agent: "billing",
            since: expect.any(Date),
            last_beat_at: expect.any(Date),
            done_at: null,
        });
    });

    it("wakes a call asked again, on a new request, and keeps when it started waiting", async () => {
        const projectId = await createProject(test.db, "Acme");
        const first = await openApprovalRequest(test.db, projectId, requestInput());
        const second = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        const waiter = waiterInput(first.id);
        await addWaiter(test.db, projectId, waiter);
        await age(projectId, true);

        await addWaiter(test.db, projectId, { ...waiter, requestId: second.id, stepId: "5".repeat(16) });

        const row = await waiterRow(projectId, waiter.askId);
        expect(row).toMatchObject({ request_id: second.id, step_id: "5".repeat(16), since: LONG_AGO, done_at: null });
        expect(row.last_beat_at.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    });
});

describe("beatWaiters and finishWaiters", () => {
    it("note beats from calls still waiting, and finish each call once", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const live = waiterInput(id);
        const stopped = waiterInput(id);
        await addWaiter(test.db, projectId, live);
        await addWaiter(test.db, projectId, stopped);
        await age(projectId, false);
        expect(await finishWaiters(test.db, projectId, [stopped.askId])).toBe(1);

        expect(await beatWaiters(test.db, projectId, [live.askId, stopped.askId, "f".repeat(16)])).toBe(1);
        expect((await waiterRow(projectId, live.askId)).last_beat_at.getTime()).toBeGreaterThan(LONG_AGO.getTime());
        expect((await waiterRow(projectId, stopped.askId)).last_beat_at).toEqual(LONG_AGO);

        expect(await finishWaiters(test.db, projectId, [live.askId, stopped.askId])).toBe(1);
        expect((await waiterRow(projectId, live.askId)).done_at).toBeInstanceOf(Date);
        expect(await beatWaiters(test.db, projectId, [live.askId])).toBe(0);
    });

    it("do nothing for no calls, or for calls in another project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        const waiter = waiterInput(id);
        await addWaiter(test.db, projectId, waiter);
        const other = await createProject(test.db, "Other");

        expect(await beatWaiters(test.db, projectId, [])).toBe(0);
        expect(await finishWaiters(test.db, projectId, [])).toBe(0);
        expect(await beatWaiters(test.db, other, [waiter.askId])).toBe(0);
        expect(await finishWaiters(test.db, other, [waiter.askId])).toBe(0);
        expect((await waiterRow(projectId, waiter.askId)).done_at).toBeNull();
    });
});

describe("waiterRequest", () => {
    it("names the request a call was last placed on, waiting or done, in this project only", async () => {
        const projectId = await createProject(test.db, "Acme");
        const first = await openApprovalRequest(test.db, projectId, requestInput());
        const second = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        const waiter = waiterInput(first.id);
        expect(await waiterRequest(test.db, projectId, waiter.askId)).toBeUndefined();

        await addWaiter(test.db, projectId, waiter);
        expect(await waiterRequest(test.db, projectId, waiter.askId)).toBe(first.id);
        await addWaiter(test.db, projectId, { ...waiter, requestId: second.id });
        await finishWaiters(test.db, projectId, [waiter.askId]);

        expect(await waiterRequest(test.db, projectId, waiter.askId)).toBe(second.id);
        expect(await waiterRequest(test.db, await createProject(test.db, "Other"), waiter.askId)).toBeUndefined();
    });
});
