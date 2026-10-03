// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { createAgentKey, createProject, listAgentKeys, revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const signedIn = { sub: "did:privy:1", email: null, github: null, exp: 0 };
    return {
        getSession: vi.fn(async (): Promise<typeof signedIn | null> => signedIn),
        refresh: vi.fn(),
        request: { headers: new Headers() },
    };
});
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/headers", () => ({ headers: async () => mocks.request.headers }));

const { createKey, revokeKey } = await import("./actions");
const { database } = await import("@/lib/data/runs/live/client");

const SIGN_IN = { error: "Sign in again to change agent keys." };
const GONE = { error: "This key is already revoked or no longer exists." };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.stubEnv("QUARD_PROJECT_ID", "");
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

beforeEach(() => {
    mocks.refresh.mockClear();
    mocks.request.headers = new Headers({ origin: "https://quard.test", host: "quard.test" });
});

// A new project, made the one the dashboard reads
async function project(): Promise<string> {
    const id = await createProject(test.db, "Team");
    vi.stubEnv("QUARD_PROJECT_ID", id);
    return id;
}

async function names(projectId: string): Promise<string[]> {
    return (await listAgentKeys(test.db, projectId)).map((key) => key.name).sort();
}

describe("createKey", () => {
    it("gives a new install a Default project with its first key, and the secret only once", async () => {
        const result = await createKey("  billing-service ");

        const projects = await test.db.selectFrom("projects").select(["id", "name"]).execute();
        expect(projects.map((row) => row.name)).toEqual(["Default"]);
        if (!("secret" in result)) throw new Error(result.error);
        expect(result.secret).toMatch(/^qk_live_[0-9a-f]{48}$/);
        expect(result.key).toEqual({
            id: expect.any(String),
            name: "billing-service",
            prefix: result.secret.slice(0, 12),
        });
        const stored = await test.db
            .selectFrom("agent_keys")
            .selectAll()
            .where("id", "=", result.key.id)
            .executeTakeFirstOrThrow();
        expect(stored).toMatchObject({ project_id: projects[0].id, name: "billing-service", revoked_at: null });
        expect(stored.key_hash).toBe(sha256(result.secret));
        expect(JSON.stringify(stored)).not.toContain(result.secret);
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it("adds later keys to the project that already exists", async () => {
        await createKey("support");

        const projects = await test.db.selectFrom("projects").select("id").execute();
        expect(projects).toHaveLength(1);
        expect(await names(projects[0].id)).toEqual(["billing-service", "support"]);
    });

    it("refuses a name an active key uses, but takes one only a revoked key used", async () => {
        const id = await project();
        await createAgentKey(test.db, id, "staging");
        const old = await createAgentKey(test.db, id, "old");
        await revokeAgentKey(test.db, id, old.id);

        expect(await createKey(" staging ")).toEqual({ error: "An active key already has this name." });
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(await createKey("old")).toMatchObject({ key: { name: "old" } });
        expect(await names(id)).toEqual(["old", "old", "staging"]);
    });

    it("checks the name again on the server", async () => {
        const id = await project();

        expect(await createKey("   ")).toEqual({ error: "Give the key a name, such as the app that will use it." });
        expect(await createKey("a".repeat(49))).toEqual({ error: "Keep the name under 48 characters." });
        expect(await createKey(42 as unknown as string)).toEqual({
            error: "Give the key a name, such as the app that will use it.",
        });
        expect(await names(id)).toEqual([]);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
});

describe("revokeKey", () => {
    it("revokes an active key once and refreshes the page", async () => {
        const id = await project();
        const key = await createAgentKey(test.db, id, "billing");

        expect(await revokeKey(key.id)).toEqual({ ok: true });
        const [row] = await listAgentKeys(test.db, id);
        expect(row.revokedAt).toBeInstanceOf(Date);
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(await revokeKey(key.id)).toEqual(GONE);
        expect((await listAgentKeys(test.db, id))[0].revokedAt).toEqual(row.revokedAt);
        expect(mocks.refresh).toHaveBeenCalledTimes(2);
    });

    it("leaves another project's key and made-up ids alone", async () => {
        const other = await createAgentKey(test.db, await project(), "other");
        await project();

        expect(await revokeKey(other.id)).toEqual(GONE);
        expect(await revokeKey("not-a-key")).toEqual(GONE);
        expect(await revokeKey(randomUUID())).toEqual(GONE);
        const rows = await test.db.selectFrom("agent_keys").select("revoked_at").where("id", "=", other.id).execute();
        expect(rows).toEqual([{ revoked_at: null }]);
    });
});

describe("key actions refuse", () => {
    it("people who are not signed in", async () => {
        const id = await project();
        const key = await createAgentKey(test.db, id, "billing");
        mocks.getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

        expect(await createKey("support")).toEqual(SIGN_IN);
        expect(await revokeKey(key.id)).toEqual(SIGN_IN);
        expect(await names(id)).toEqual(["billing"]);
        expect((await listAgentKeys(test.db, id))[0].revokedAt).toBeNull();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("requests that come from another site", async () => {
        const id = await project();
        const key = await createAgentKey(test.db, id, "billing");
        mocks.request.headers = new Headers({ origin: "https://evil.example", host: "quard.test" });

        expect(await createKey("support")).toEqual(SIGN_IN);
        expect(await revokeKey(key.id)).toEqual(SIGN_IN);
        expect(await names(id)).toEqual(["billing"]);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("to make a project when QUARD_PROJECT_ID names one that does not exist", async () => {
        const before = await test.db.selectFrom("projects").select("id").execute();
        vi.stubEnv("QUARD_PROJECT_ID", randomUUID());

        expect(await createKey("billing")).toEqual({ error: "QUARD_PROJECT_ID names no project." });
        expect(await revokeKey(randomUUID())).toEqual(GONE);
        expect(await test.db.selectFrom("projects").select("id").execute()).toHaveLength(before.length);
    });
});
