import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject } from "./projects.ts";
import { createAgentKey, projectForKey, revokeAgentKey } from "./keys.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

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

        await revokeAgentKey(test.db, projectId, created.id);
        expect(await projectForKey(test.db, created.key)).toBeUndefined();
    });

    it("knows nothing about an unknown key", async () => {
        expect(await projectForKey(test.db, "qk_live_nope")).toBeUndefined();
    });
});
