import { hashToken, keyPrefix, newAgentKey } from "../auth/tokens.ts";
import type { Db } from "../connect/connect.ts";

// The key itself is only returned here, once. The database keeps a hash.
export type NewAgentKey = { id: string; key: string; prefix: string };

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

export async function revokeAgentKey(db: Db, projectId: string, id: string): Promise<void> {
    await db
        .updateTable("agent_keys")
        .set({ revoked_at: new Date() })
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .execute();
}
