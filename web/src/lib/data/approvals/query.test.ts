// @vitest-environment node
import { addWaiter, createProject, decideApproval, ingestBatch, openApprovalRequest, revokeGrant } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ASKED_STEP, askInput, waitingRun } from "../../../../test/approvals-overview/live";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getApproval, getApprovals, openApprovalCount, openApprovalRequests } = await import("./query");
const { database } = await import("../runs/live/client");

// The run that asks, one that never reached the dashboard, and an older one that was answered
const RUN = "b".repeat(32);
const LOST = "c".repeat(32);
const OLD = "d".repeat(32);
const ids = { open: "", lost: "", old: "" };
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

describe("approvals from Postgres", () => {
    it("shows nothing before a project exists", async () => {
        expect(await getApprovals()).toEqual({ open: [], grants: [], decisions: [] });
        expect(await getApproval("apr_0000000000000000")).toBeNull();
        expect(await openApprovalRequests()).toEqual([]);
        expect(await openApprovalCount()).toBe(0);
    });

    it("lists open requests with the asking run's path, the grants and the past answers", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, waitingRun(RUN));
        ids.open = (await openApprovalRequest(test.db, projectId, askInput(RUN))).id;
        const waiter = { askId: "a".repeat(16), requestId: ids.open, runId: RUN, stepId: ASKED_STEP, agent: "billing" };
        await addWaiter(test.db, projectId, waiter);
        ids.lost = (await openApprovalRequest(test.db, projectId, askInput(LOST, { argsHash: "e".repeat(32) }))).id;
        ids.old = (await openApprovalRequest(test.db, projectId, askInput(OLD, { argsHash: "f".repeat(32) }))).id;
        await decideApproval(test.db, projectId, ids.old, "always", "dana@acme.com");

        const data = await getApprovals();
        expect(requireSession).toHaveBeenCalled();
        expect(data.open.map((item) => item.request.id).sort()).toEqual([ids.open, ids.lost].sort());
        const waiting = data.open.find((item) => item.request.id === ids.open)!;
        expect(waiting.heartbeat.state).toBe("live");
        expect(waiting.request).toMatchObject({ agent: "billing", tool: "payInvoice", waiting: true });
        expect(waiting.args[0]).toMatchObject({ name: "iban", value: "GB33 BUKB 2020 1555 5555", masked: "GB33…5555" });
        expect(waiting.path.map((node) => [node.kind, node.title])).toEqual([
            ["origin", "acme-billing.net"],
            ["agent", "billing"],
            ["call", "payInvoice"],
        ]);
        expect(waiting.decisions.map((check) => [check.rule, check.reason])).toEqual([
            ["approval", "payInvoice asks a human first"],
        ]);
        // No call waits on it and its run never arrived
        const lost = data.open.find((item) => item.request.id === ids.lost)!;
        expect(lost.heartbeat.state).toBe("stopped");
        expect(lost.path).toEqual([]);

        expect(data.grants).toHaveLength(1);
        expect(data.grants[0]).toMatchObject({ agent: "billing", tool: "payInvoice", approvedBy: "dana@acme.com" });
        expect(data.decisions).toEqual([
            expect.objectContaining({
                requestId: ids.old,
                runId: OLD,
                answer: "always approve",
                by: "dana@acme.com",
                args: [
                    { name: "iban", value: "GB33…5555" },
                    { name: "amount", value: "4950" },
                ],
            }),
        ]);
    });

    it("shows a revoked grant as revoked", async () => {
        const [grant] = (await getApprovals()).grants;
        const projectId = (await test.db.selectFrom("projects").select("id").executeTakeFirstOrThrow()).id;
        await revokeGrant(test.db, projectId, grant.id, "@dana-k");
        expect((await getApprovals()).grants[0]).toMatchObject({ id: grant.id, revokedBy: "@dana-k" });
    });

    it("opens one open request, and none that is decided or unknown", async () => {
        const detail = await getApproval(ids.open);
        expect(detail?.request.id).toBe(ids.open);
        expect(detail?.path).toHaveLength(3);
        expect((await getApproval(ids.lost))?.path).toEqual([]);
        expect(await getApproval(ids.old)).toBeNull();
        expect(await getApproval("apr_ffffffffffffffff")).toBeNull();
    });

    it("lists the open requests for the overview and counts them for the sidebar", async () => {
        const requests = await openApprovalRequests();
        expect(requests.map((request) => request.id).sort()).toEqual([ids.open, ids.lost].sort());
        expect(requests.find((request) => request.id === ids.open)?.waiting).toBe(true);
        expect(await openApprovalCount()).toBe(2);
    });
});
