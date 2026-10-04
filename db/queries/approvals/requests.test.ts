import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../connect/connect.ts";
import { askId, HASH, requestInput, RULES, RUN, STEP } from "../../test/approvals.ts";
import { listeningDb, settle } from "../../test/notify.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { claimRequest } from "./claims.ts";
import { decideApproval } from "./decide.ts";
import { decidedRequests, getApprovalRequest, openApprovalRequest } from "./requests.ts";

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

describe("openApprovalRequest", () => {
    it("opens a request with everything the approver sees", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();

        const opened = await openApprovalRequest(test.db, projectId, input);

        expect(opened.created).toBe(true);
        expect(opened.id).toMatch(/^apr_[0-9a-f]{16}$/);
        expect(await getApprovalRequest(test.db, projectId, opened.id)).toEqual({
            id: opened.id,
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
            openedAt: expect.any(Date),
            answer: null,
            decidedBy: null,
            decidedAt: null,
            usedBy: null,
            usedAt: null,
        });
    });

    it("lets identical calls wait on the one open request", async () => {
        const projectId = await createProject(test.db, "Acme");
        const first = await openApprovalRequest(test.db, projectId, requestInput());

        const again = await openApprovalRequest(test.db, projectId, requestInput({ runId: "9".repeat(32) }));
        expect(again).toEqual({ id: first.id, created: false });
        // The call that asked first stays on the request
        expect((await getApprovalRequest(test.db, projectId, first.id))?.runId).toBe(RUN);

        const otherArgs = await openApprovalRequest(test.db, projectId, requestInput({ argsHash: "e".repeat(32) }));
        const otherAgent = await openApprovalRequest(test.db, projectId, requestInput({ agent: "support" }));
        const otherTool = await openApprovalRequest(test.db, projectId, requestInput({ tool: "refund" }));
        const ids = new Set([first.id, otherArgs.id, otherAgent.id, otherTool.id]);
        expect(ids.size).toBe(4);

        const elsewhere = await openApprovalRequest(test.db, await createProject(test.db, "Other"), requestInput());
        expect(elsewhere.created).toBe(true);
    });

    it("tells the dashboard about a new request, not about a joined one", async () => {
        const listening = await listeningDb(test.url);
        try {
            const projectId = await createProject(listening.db, "Acme");
            await openApprovalRequest(listening.db, projectId, requestInput());
            await openApprovalRequest(listening.db, projectId, requestInput({ runId: "9".repeat(32) }));
            await settle();

            expect(listening.heard).toEqual([
                { channel: "quard_live", payload: JSON.stringify({ project: projectId, topic: "approvals" }) },
            ]);
        } finally {
            await listening.stop();
        }
    });

    it("opens a new request once the open one is decided", async () => {
        const projectId = await createProject(test.db, "Acme");
        const first = await openApprovalRequest(test.db, projectId, requestInput());
        await decideApproval(test.db, projectId, first.id, "once", "dana@acme.com");

        const next = await openApprovalRequest(test.db, projectId, requestInput());

        expect(next.created).toBe(true);
        expect(next.id).not.toBe(first.id);
    });

    it("gives two calls that ask at the same time the same request", async () => {
        const projectId = await createProject(test.db, "Acme");

        const results = await Promise.all(
            [1, 2, 3].map((n) => openApprovalRequest(many, projectId, requestInput({ runId: String(n).repeat(32) }))),
        );

        expect(new Set(results.map((result) => result.id)).size).toBe(1);
        expect(results.filter((result) => result.created)).toHaveLength(1);
    });

    it("stores missing arguments and rules as null", async () => {
        const projectId = await createProject(test.db, "Acme");

        const opened = await openApprovalRequest(
            test.db,
            projectId,
            requestInput({ args: undefined, masked: undefined, rulesHash: undefined }),
        );

        expect(await getApprovalRequest(test.db, projectId, opened.id)).toMatchObject({
            args: null,
            masked: null,
            rulesHash: null,
        });
    });
});

describe("getApprovalRequest", () => {
    it("finds nothing for an unknown id or in another project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const opened = await openApprovalRequest(test.db, projectId, requestInput());

        expect(await getApprovalRequest(test.db, projectId, "apr_0000000000000001")).toBeUndefined();
        expect(await getApprovalRequest(test.db, await createProject(test.db, "Other"), opened.id)).toBeUndefined();
    });

    it("shows the answer, who gave it and the call that used it", async () => {
        const projectId = await createProject(test.db, "Acme");
        const opened = await openApprovalRequest(test.db, projectId, requestInput());
        const ask = askId();
        await decideApproval(test.db, projectId, opened.id, "once", "dana@acme.com");
        await claimRequest(test.db, projectId, opened.id, ask);

        expect(await getApprovalRequest(test.db, projectId, opened.id)).toMatchObject({
            args: null,
            answer: "once",
            decidedBy: "dana@acme.com",
            decidedAt: expect.any(Date),
            usedBy: ask,
            usedAt: expect.any(Date),
        });
    });
});

describe("decidedRequests", () => {
    it("lists the decided requests among the ids, from any project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        const open = await openApprovalRequest(test.db, one, requestInput());
        const denied = await openApprovalRequest(test.db, one, requestInput({ argsHash: "e".repeat(32) }));
        const approved = await openApprovalRequest(test.db, two, requestInput());
        const ask = askId();
        await decideApproval(test.db, one, denied.id, "deny", "dana@acme.com");
        await decideApproval(test.db, two, approved.id, "once", "li.wei@acme.com");
        await claimRequest(test.db, two, approved.id, ask);
        // Oldest decision first
        for (const [id, day] of [
            [denied.id, 1],
            [approved.id, 2],
        ] as const) {
            await test.db
                .updateTable("approval_requests")
                .set({ decided_at: new Date(Date.UTC(2026, 0, day)) })
                .where("id", "=", id)
                .execute();
        }

        const decided = await decidedRequests(test.db, [open.id, denied.id, approved.id, "apr_0000000000000002"]);

        expect(decided).toEqual([
            { projectId: one, id: denied.id, answer: "deny", usedBy: null },
            { projectId: two, id: approved.id, answer: "once", usedBy: ask },
        ]);
        expect(await decidedRequests(test.db, [])).toEqual([]);
    });
});
