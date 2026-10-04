import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestInput, waiterInput } from "../../test/approvals.ts";
import { listeningDb, settle } from "../../test/notify.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { openApprovalRequest } from "./requests.ts";
import { addWaiter, beatWaiters, finishWaiters } from "./waiters.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("waiter notices", () => {
    it("tell the dashboard when a call starts or stops waiting, not on a heartbeat", async () => {
        const listening = await listeningDb(test.url);
        try {
            const projectId = await createProject(test.db, "Acme");
            const { id } = await openApprovalRequest(test.db, projectId, requestInput());
            const waiter = waiterInput(id);
            const approvals = {
                channel: "quard_live",
                payload: JSON.stringify({ project: projectId, topic: "approvals" }),
            };

            await addWaiter(listening.db, projectId, waiter);
            await beatWaiters(listening.db, projectId, [waiter.askId]);
            await settle();
            expect(listening.heard).toEqual([approvals]);

            expect(await finishWaiters(listening.db, projectId, [waiter.askId])).toBe(1);
            expect(await finishWaiters(listening.db, projectId, [waiter.askId])).toBe(0);
            await settle();
            expect(listening.heard).toEqual([approvals, approvals]);
        } finally {
            await listening.stop();
        }
    });
});
