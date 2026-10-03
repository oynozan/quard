import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../../connect/connect.ts";
import { HASH, requestInput } from "../../test/approvals.ts";
import { listeningDb, settle } from "../../test/notify.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { findActiveGrant } from "./claims.ts";
import { decideApproval, revokeGrant } from "./decide.ts";
import { getApprovalRequest, openApprovalRequest } from "./requests.ts";

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

async function grants(projectId: string) {
    return test.db
        .selectFrom("approval_grants")
        .selectAll()
        .where("project_id", "=", projectId)
        .orderBy("approved_at")
        .execute();
}

describe("decideApproval", () => {
    it("records the answer and who gave it, and drops the full arguments", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();
        const { id } = await openApprovalRequest(test.db, projectId, input);

        expect(await decideApproval(test.db, projectId, id, "once", "dana@acme.com")).toBe("decided");

        expect(await getApprovalRequest(test.db, projectId, id)).toMatchObject({
            args: null,
            masked: input.masked,
            argsHash: HASH,
            answer: "once",
            decidedBy: "dana@acme.com",
            decidedAt: expect.any(Date),
            usedBy: null,
        });
        expect(await grants(projectId)).toEqual([]);
    });

    it("decides a request only once, and only in its own project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        await decideApproval(test.db, projectId, id, "deny", "dana@acme.com");

        expect(await decideApproval(test.db, projectId, id, "once", "li.wei@acme.com")).toBe("already_decided");
        expect(await getApprovalRequest(test.db, projectId, id)).toMatchObject({
            answer: "deny",
            decidedBy: "dana@acme.com",
        });
        expect(await decideApproval(test.db, projectId, "apr_0000000000000001", "once", "dana@acme.com")).toBe(
            "not_found",
        );
        const other = await createProject(test.db, "Other");
        expect(await decideApproval(test.db, other, id, "once", "dana@acme.com")).toBe("not_found");
        expect(await grants(projectId)).toEqual([]);
    });

    it("adds a grant for always approve, unless an active one covers the call", async () => {
        const projectId = await createProject(test.db, "Acme");
        const input = requestInput();
        const first = await openApprovalRequest(test.db, projectId, input);
        expect(await decideApproval(test.db, projectId, first.id, "always", "dana@acme.com")).toBe("decided");

        const [grant] = await grants(projectId);
        expect(grant).toMatchObject({
            id: expect.stringMatching(/^grt_[0-9a-f]{16}$/),
            request_id: first.id,
            agent: "billing",
            tool: "payInvoice",
            args_hash: HASH,
            masked: input.masked,
            approved_by: "dana@acme.com",
            times_used: 0,
            revoked_at: null,
        });

        // A call that asked while the grant was being made
        const second = await openApprovalRequest(test.db, projectId, input);
        expect(await decideApproval(test.db, projectId, second.id, "always", "li.wei@acme.com")).toBe("decided");
        expect(await grants(projectId)).toHaveLength(1);

        await revokeGrant(test.db, projectId, String(grant?.id), "li.wei@acme.com");
        const third = await openApprovalRequest(test.db, projectId, input);
        await decideApproval(test.db, projectId, third.id, "always", "marco@acme.com");
        const rows = await grants(projectId);
        expect(rows.map((row) => [row.approved_by, row.revoked_at === null]).sort()).toEqual([
            ["dana@acme.com", false],
            ["marco@acme.com", true],
        ]);
        expect(await findActiveGrant(test.db, projectId, "billing", "payInvoice", HASH)).toEqual({
            id: rows.find((row) => row.approved_by === "marco@acme.com")?.id,
        });
    });

    it("announces a decision when it commits, and nothing otherwise", async () => {
        const listening = await listeningDb(test.url);
        try {
            const projectId = await createProject(listening.db, "Acme");
            const { id } = await openApprovalRequest(listening.db, projectId, requestInput());

            await decideApproval(listening.db, projectId, id, "once", "dana@acme.com");
            await decideApproval(listening.db, projectId, id, "deny", "dana@acme.com");
            await decideApproval(listening.db, projectId, "apr_0000000000000001", "deny", "dana@acme.com");
            await settle();

            expect(listening.heard).toEqual([{ channel: "quard_approvals", payload: id }]);
        } finally {
            await listening.stop();
        }
    });

    it("lets only one of two approvers decide", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());

        const results = await Promise.all([
            decideApproval(many, projectId, id, "always", "dana@acme.com"),
            decideApproval(many, projectId, id, "deny", "li.wei@acme.com"),
        ]);

        expect(results.sort()).toEqual(["already_decided", "decided"]);
        const answer = (await getApprovalRequest(test.db, projectId, id))?.answer;
        expect(await grants(projectId)).toHaveLength(answer === "always" ? 1 : 0);
    });
});

describe("revokeGrant", () => {
    it("revokes an active grant once, and records who did it", async () => {
        const projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, requestInput());
        await decideApproval(test.db, projectId, id, "always", "dana@acme.com");
        const grant = String((await grants(projectId))[0]?.id);

        expect(await revokeGrant(test.db, await createProject(test.db, "Other"), grant, "x")).toBe(false);
        expect(await revokeGrant(test.db, projectId, grant, "li.wei@acme.com")).toBe(true);
        expect(await revokeGrant(test.db, projectId, grant, "marco@acme.com")).toBe(false);
        expect(await revokeGrant(test.db, projectId, "grt_0000000000000001", "marco@acme.com")).toBe(false);

        expect((await grants(projectId))[0]).toMatchObject({
            revoked_at: expect.any(Date),
            revoked_by: "li.wei@acme.com",
        });
    });
});
