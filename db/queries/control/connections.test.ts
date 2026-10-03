import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createAgentKey } from "../keys.ts";
import { createProject } from "../projects.ts";
import { closeConnection, openConnection, saveAgentVersion, saveRules } from "./connections.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const RULES = {
    hash: "a".repeat(16),
    list: [{ tool: "payInvoice", guard: "approval", rule: "approval", mode: "block" as const }],
};

async function connection(projectId: string, id: string) {
    return test.db
        .selectFrom("sdk_connections")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

async function linked(): Promise<{ projectId: string; id: string; keyId: string }> {
    const projectId = await createProject(test.db, "Acme");
    const key = await createAgentKey(test.db, projectId, "billing");
    const id = await openConnection(test.db, projectId, { keyId: key.id, sdk: "0.0.0", host: "web-1", pid: 4242 });
    return { projectId, id, keyId: key.id };
}

describe("openConnection and closeConnection", () => {
    it("record when an SDK process connects and disconnects", async () => {
        const { projectId, id, keyId } = await linked();

        expect(id).toMatch(/^con_[0-9a-f]{16}$/);
        expect(await connection(projectId, id)).toMatchObject({
            key_id: keyId,
            sdk: "0.0.0",
            host: "web-1",
            pid: 4242,
            rules_hash: null,
            connected_at: expect.any(Date),
            disconnected_at: null,
        });

        await closeConnection(test.db, projectId, id);
        const closed = (await connection(projectId, id)).disconnected_at;
        expect(closed).toBeInstanceOf(Date);
        // A second close keeps the first time
        await test.db.updateTable("sdk_connections").set({ disconnected_at: LONG_AGO }).where("id", "=", id).execute();
        await closeConnection(test.db, projectId, id);
        expect((await connection(projectId, id)).disconnected_at).toEqual(LONG_AGO);
    });
});

describe("saveRules", () => {
    it("keeps each rule set once and notes which one each connection runs", async () => {
        const { projectId, id } = await linked();
        const second = await openConnection(test.db, projectId, {
            keyId: (await connection(projectId, id)).key_id,
            sdk: "0.0.0",
            host: "web-2",
            pid: 7,
        });

        await saveRules(test.db, projectId, id, RULES);
        await test.db
            .updateTable("rule_sets")
            .set({ last_seen_at: LONG_AGO })
            .where("project_id", "=", projectId)
            .execute();
        await saveRules(test.db, projectId, second, RULES);

        const sets = await test.db.selectFrom("rule_sets").selectAll().where("project_id", "=", projectId).execute();
        expect(sets).toHaveLength(1);
        expect(sets[0]).toMatchObject({ hash: RULES.hash, rules: RULES.list, first_seen_at: expect.any(Date) });
        expect(sets[0]?.last_seen_at.getTime()).toBeGreaterThan(LONG_AGO.getTime());
        expect((await connection(projectId, id)).rules_hash).toBe(RULES.hash);
        expect((await connection(projectId, second)).rules_hash).toBe(RULES.hash);

        const changed = { hash: "b".repeat(16), list: [] };
        await saveRules(test.db, projectId, id, changed);
        expect((await connection(projectId, id)).rules_hash).toBe(changed.hash);
        expect(
            await test.db.selectFrom("rule_sets").select("hash").where("project_id", "=", projectId).execute(),
        ).toHaveLength(2);
    });
});

describe("saveAgentVersion", () => {
    it("keeps each agent version once, and notes when it was last seen", async () => {
        const projectId = await createProject(test.db, "Acme");
        const version = {
            agent: "billing",
            version: "c".repeat(16),
            model: "gpt-5.4-mini",
            tools: ["payInvoice", "fetchPage"],
            instructions: "Pay approved invoices.",
        };

        await saveAgentVersion(test.db, projectId, version);
        await test.db
            .updateTable("agent_versions")
            .set({ last_seen_at: LONG_AGO })
            .where("project_id", "=", projectId)
            .execute();
        await saveAgentVersion(test.db, projectId, version);
        await saveAgentVersion(test.db, projectId, { ...version, version: "d".repeat(16), instructions: undefined });

        const rows = await test.db
            .selectFrom("agent_versions")
            .selectAll()
            .where("project_id", "=", projectId)
            .orderBy("version")
            .execute();
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            agent: "billing",
            model: "gpt-5.4-mini",
            tools: ["payInvoice", "fetchPage"],
            instructions: "Pay approved invoices.",
        });
        expect(rows[0]?.last_seen_at.getTime()).toBeGreaterThan(LONG_AGO.getTime());
        expect(rows[1]?.instructions).toBeNull();
    });
});
