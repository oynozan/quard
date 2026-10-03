// @vitest-environment node
import { createProject, getApprovalRequest, listGrants, openApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { redirect } from "next/navigation";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/session-token";
import { askInput } from "../../../../test/approvals-overview/live";

const DANA: Session = { sub: "did:privy:1", email: "dana@acme.com", github: null, exp: 0 };
const signedIn = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => signedIn.session ?? redirect("/sign-in"),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const { answerApproval, revokeAlwaysGrant } = await import("./actions");
const { database } = await import("../runs/live/client");

const RUN = "b".repeat(32);
const REQUEST = "apr_0123456789abcdef";
const GRANT = "grt_0123456789abcdef";
let test: TestDb;
let projectId = "";

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterEach(() => {
    signedIn.session = DANA;
    cache.revalidatePath.mockClear();
});

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

describe("approval actions", () => {
    it("send a visitor without a session to sign in before reading anything", async () => {
        await expect(answerApproval("not an id", "once")).rejects.toThrow("NEXT_REDIRECT");
        await expect(revokeAlwaysGrant("not an id")).rejects.toThrow("NEXT_REDIRECT");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("turn away anything that is not a request id and an answer, or a grant id", async () => {
        await expect(answerApproval("apr_123", "once")).rejects.toThrow("Not an approval answer");
        await expect(answerApproval(42 as never, "once")).rejects.toThrow("Not an approval answer");
        await expect(answerApproval(REQUEST, "maybe" as never)).rejects.toThrow("Not an approval answer");
        await expect(revokeAlwaysGrant("grant_1")).rejects.toThrow("Not a grant id");
        await expect(revokeAlwaysGrant(7 as never)).rejects.toThrow("Not a grant id");
    });

    it("find nothing before a project exists", async () => {
        expect(await answerApproval(REQUEST, "once")).toBe("not_found");
        expect(await revokeAlwaysGrant(GRANT)).toBe(false);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/approvals");
    });
});

describe("answerApproval", () => {
    it("saves the answer once, signed with the approver's name, and reloads the approvals page", async () => {
        projectId = await createProject(test.db, "Acme");
        const { id } = await openApprovalRequest(test.db, projectId, askInput(RUN));
        expect(await answerApproval(id, "always")).toBe("decided");
        expect(cache.revalidatePath).toHaveBeenCalledWith("/approvals");
        const saved = await getApprovalRequest(test.db, projectId, id);
        expect(saved).toMatchObject({ answer: "always", decidedBy: "dana@acme.com", args: null });
        expect(await listGrants(test.db, projectId)).toEqual([
            expect.objectContaining({ requestId: id, approvedBy: "dana@acme.com", revokedAt: null }),
        ]);

        signedIn.session = { ...DANA, email: null, github: "li-wei" };
        expect(await answerApproval(id, "deny")).toBe("already_decided");
        expect((await getApprovalRequest(test.db, projectId, id))?.decidedBy).toBe("dana@acme.com");
        expect(await answerApproval("apr_ffffffffffffffff", "once")).toBe("not_found");
    });
});

describe("revokeAlwaysGrant", () => {
    it("ends a grant once, signed with the person's name", async () => {
        const [grant] = await listGrants(test.db, projectId);
        signedIn.session = { ...DANA, email: null, github: "dana-k" };
        expect(await revokeAlwaysGrant(grant.id)).toBe(true);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/approvals");
        expect((await listGrants(test.db, projectId))[0]).toMatchObject({ id: grant.id, revokedBy: "@dana-k" });
        expect(await revokeAlwaysGrant(grant.id)).toBe(false);
    });
});
