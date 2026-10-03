import { newEventId, type RulesSnapshot } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// An SDK process that said hello to control
export type ConnectionInput = { keyId: string; sdk: string; host: string; pid: number };

// One agent's model, instructions and tools, under its version hash
export type AgentVersionInput = {
    agent: string;
    version: string;
    model: string;
    tools: string[];
    instructions?: string;
};

// Returns the connection id, "con_" and 16 hex characters
export async function openConnection(db: Db, projectId: string, input: ConnectionInput): Promise<string> {
    const id = `con_${newEventId()}`;
    await db
        .insertInto("sdk_connections")
        .values({ project_id: projectId, id, key_id: input.keyId, sdk: input.sdk, host: input.host, pid: input.pid })
        .execute();
    return id;
}

export async function closeConnection(db: Db, projectId: string, connectionId: string): Promise<void> {
    await db
        .updateTable("sdk_connections")
        .set({ disconnected_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where("id", "=", connectionId)
        .where("disconnected_at", "is", null)
        .execute();
}

// Keeps each set of rules once, by hash, and notes which one the connection runs
export async function saveRules(
    db: Db,
    projectId: string,
    connectionId: string,
    snapshot: RulesSnapshot,
): Promise<void> {
    await db.transaction().execute(async (trx) => {
        await trx
            .insertInto("rule_sets")
            .values({ project_id: projectId, hash: snapshot.hash, rules: JSON.stringify(snapshot.list) })
            .onConflict((conflict) =>
                conflict.columns(["project_id", "hash"]).doUpdateSet({ last_seen_at: sql<Date>`now()` }),
            )
            .execute();
        await trx
            .updateTable("sdk_connections")
            .set({ rules_hash: snapshot.hash })
            .where("project_id", "=", projectId)
            .where("id", "=", connectionId)
            .execute();
    });
}

// The version hash covers the model, instructions and tools, so a known
// version only gets a fresh last_seen_at
export async function saveAgentVersion(db: Db, projectId: string, input: AgentVersionInput): Promise<void> {
    await db
        .insertInto("agent_versions")
        .values({
            project_id: projectId,
            agent: input.agent,
            version: input.version,
            model: input.model,
            tools: input.tools,
            instructions: input.instructions ?? null,
        })
        .onConflict((conflict) =>
            conflict.columns(["project_id", "agent", "version"]).doUpdateSet({ last_seen_at: sql<Date>`now()` }),
        )
        .execute();
}
