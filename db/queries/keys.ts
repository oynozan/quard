import { hashToken, keyPrefix, newAgentKey } from "../auth/tokens.ts";
import type { Db } from "../connect/connect.ts";

// The key itself is only returned here, once. The database keeps a hash.
export type NewAgentKey = { id: string; key: string; prefix: string };

// A key as the dashboard lists it. The hash is never read.
export type AgentKeyRow = {
    id: string;
    name: string;
    prefix: string;
    createdAt: Date;
    // The last upload made with the key
    lastUsedAt: Date | null;
    revokedAt: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createAgentKey(db: Db, projectId: string, name: string): Promise<NewAgentKey> {
    const key = newAgentKey();
    const row = await db
        .insertInto("agent_keys")
        .values({ project_id: projectId, name, prefix: keyPrefix(key), key_hash: hashToken(key) })
        .returning("id")
        .executeTakeFirstOrThrow();
    return { id: row.id, key, prefix: keyPrefix(key) };
}

// The project of a known, unrevoked key. Also notes when it was used.
export async function projectForKey(db: Db, key: string): Promise<string | undefined> {
    const row = await db
        .updateTable("agent_keys")
        .set({ last_used_at: new Date() })
        .where("key_hash", "=", hashToken(key))
        .where("revoked_at", "is", null)
        .returning("project_id")
        .executeTakeFirst();
    return row?.project_id;
}

// Newest first. Revoked keys stay in the list.
export async function listAgentKeys(db: Db, projectId: string): Promise<AgentKeyRow[]> {
    return db
        .selectFrom("agent_keys")
        .select([
            "id",
            "name",
            "prefix",
            "created_at as createdAt",
            "last_used_at as lastUsedAt",
            "revoked_at as revokedAt",
        ])
        .where("project_id", "=", projectId)
        .orderBy("created_at", "desc")
        .orderBy("id")
        .execute();
}

// True when an active key of the project was revoked. An unknown id,
// another project's key or an already revoked key gives false.
export async function revokeAgentKey(db: Db, projectId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) {
        return false;
    }
    const row = await db
        .updateTable("agent_keys")
        .set({ revoked_at: new Date() })
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .where("revoked_at", "is", null)
        .returning("id")
        .executeTakeFirst();
    return row !== undefined;
}
