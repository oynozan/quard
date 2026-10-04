// @vitest-environment node
import { addWaiter, createProject, openApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ASKED_STEP, askInput } from "../../../../test/approvals-overview/live";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getApproval, getApprovals, openApprovalCount, openApprovalRequests } = await import("./query");
const { database } = await import("../runs/live/client");

const RUN = "b".repeat(32);
const START = Date.UTC(2026, 9, 3, 12);
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// Opens a request `minute` minutes after START, with its own arguments
async function openAt(projectId: string, minute: number): Promise<string> {
    const argsHash = minute.toString(16).padStart(32, "0");
    const { id } = await openApprovalRequest(test.db, projectId, askInput(RUN, { argsHash }));
    await test.db
        .updateTable("approval_requests")
        .set({ opened_at: new Date(START + minute * 60_000) })
        .where("id", "=", id)
        .execute();
    return id;
}

const ids = (items: { request: { id: string } }[]) => items.map((item) => item.request.id);

describe("an approvals page with more than a hundred open requests", () => {
    it("lists the call that still waits first, then the longest wait, and reaches every other one", async () => {
        const projectId = await createProject(test.db, "Acme");
        // The oldest request has a call that still waits; nobody waits on the 105 after it
        const live = await openAt(projectId, 0);
        const waiter = { askId: "a".repeat(16), requestId: live, runId: RUN, stepId: ASKED_STEP, agent: "billing" };
        await addWaiter(test.db, projectId, waiter);
        const stopped: string[] = [];
        for (let minute = 1; minute <= 105; minute += 1) {
            stopped.push(await openAt(projectId, minute));
        }

        const first = await getApprovals(100);
        expect(ids(first.open)).toEqual([live, ...stopped.slice(0, 99)]);
        expect(first.more).toBe(6);
        expect(await openApprovalCount()).toBe(first.open.length + first.more);

        const next = await getApprovals(200);
        expect(ids(next.open)).toEqual([live, ...stopped]);
        expect(next.more).toBe(0);

        expect((await getApproval(stopped[104]))?.request.id).toBe(stopped[104]);
        const overview = await openApprovalRequests();
        expect(overview.slice(0, 5).map((request) => [request.id, request.waiting])).toEqual([
            [live, true],
            ...stopped.slice(0, 4).map((id) => [id, false]),
        ]);
    });
});
