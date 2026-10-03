import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject } from "./projects.ts";
import { createAgentKey, listAgentKeys, projectForKey, revokeAgentKey } from "./keys.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const createdAt = async (id: string, at: string) => {
    await test.db.updateTable("agent_keys").set({ created_at: at }).where("id", "=", id).execute();
};

const revokedAt = async (id: string) => {
    const row = await test.db.selectFrom("agent_keys").select("revoked_at").where("id", "=", id).executeTakeFirst();
    return row?.revoked_at;
};

describe("agent keys", () => {
    it("finds the project of a key, notes its use, and stops after revoking", async () => {
        const projectId = await createProject(test.db, "Acme");
        const created = await createAgentKey(test.db, projectId, "billing");

        expect(created.key).toMatch(/^qk_live_/);
        expect(await projectForKey(test.db, created.key)).toBe(projectId);
        const row = await test.db.selectFrom("agent_keys").selectAll().where("id", "=", created.id).executeTakeFirst();
        expect(row).toMatchObject({ prefix: created.prefix, name: "billing" });
        expect(row?.key_hash).not.toBe(created.key);
        expect(row?.last_used_at).toBeInstanceOf(Date);

        expect(await revokeAgentKey(test.db, projectId, created.id)).toBe(true);
        expect(await projectForKey(test.db, created.key)).toBeUndefined();
    });

    it("knows nothing about an unknown key", async () => {
        expect(await projectForKey(test.db, "qk_live_nope")).toBeUndefined();
    });
});

describe("listAgentKeys", () => {
    it("has no keys in a new project", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await listAgentKeys(test.db, projectId)).toEqual([]);
    });

    it("lists the project's keys newest first, revoked ones included, without the hash", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        const old = await createAgentKey(test.db, projectId, "old");
        const fresh = await createAgentKey(test.db, projectId, "fresh");
        await createAgentKey(test.db, other, "elsewhere");
        await createdAt(old.id, "2026-10-01T09:00:00.000Z");
        await createdAt(fresh.id, "2026-10-03T09:00:00.000Z");
        await projectForKey(test.db, fresh.key);
        await revokeAgentKey(test.db, projectId, old.id);

        const keys = await listAgentKeys(test.db, projectId);

        expect(keys.map((key) => key.name)).toEqual(["fresh", "old"]);
        expect(Object.keys(keys[0] ?? {}).sort()).toEqual(
            ["createdAt", "id", "lastUsedAt", "name", "prefix", "revokedAt"].sort(),
        );
        expect(keys[0]).toMatchObject({ id: fresh.id, prefix: fresh.prefix, revokedAt: null });
        expect(keys[0]?.createdAt.toISOString()).toBe("2026-10-03T09:00:00.000Z");
        expect(keys[0]?.lastUsedAt).toBeInstanceOf(Date);
        expect(keys[1]).toMatchObject({ id: old.id, prefix: old.prefix, lastUsedAt: null });
        expect(keys[1]?.revokedAt).toBeInstanceOf(Date);
    });

    it("orders keys made at the same time by id", async () => {
        const projectId = await createProject(test.db, "Acme");
        const one = await createAgentKey(test.db, projectId, "one");
        const two = await createAgentKey(test.db, projectId, "two");
        await createdAt(one.id, "2026-10-03T09:00:00.000Z");
        await createdAt(two.id, "2026-10-03T09:00:00.000Z");

        const ids = (await listAgentKeys(test.db, projectId)).map((key) => key.id);

        expect(ids).toEqual([one.id, two.id].sort());
    });
});

describe("revokeAgentKey", () => {
    it("revokes an active key only once", async () => {
        const projectId = await createProject(test.db, "Acme");
        const created = await createAgentKey(test.db, projectId, "billing");

        expect(await revokeAgentKey(test.db, projectId, created.id)).toBe(true);
        const first = await revokedAt(created.id);
        expect(first).toBeInstanceOf(Date);

        expect(await revokeAgentKey(test.db, projectId, created.id)).toBe(false);
        expect(await revokedAt(created.id)).toEqual(first);
    });

    it("leaves other projects' keys alone and ignores unknown ids", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        const theirs = await createAgentKey(test.db, other, "billing");

        expect(await revokeAgentKey(test.db, projectId, theirs.id)).toBe(false);
        expect(await revokedAt(theirs.id)).toBeNull();
        expect(await projectForKey(test.db, theirs.key)).toBe(other);
        expect(await revokeAgentKey(test.db, projectId, "00000000-0000-0000-0000-000000000000")).toBe(false);
        expect(await revokeAgentKey(test.db, projectId, "not-a-key-id")).toBe(false);
    });
});
