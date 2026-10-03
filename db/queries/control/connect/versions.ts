import { sql } from "kysely";
import type { Db } from "../../../connect/connect.ts";

export type AgentVersionItem = {
    version: string;
    model: string;
    tools: string[];
    // 16 hex characters of the stored instructions' SHA-256, null without instructions
    instructionsHash: string | null;
    firstSeenAt: Date;
};

// An agent's newest versions first, by when control first saw each one
export async function agentVersions(
    db: Db,
    projectId: string,
    agent: string,
    options: { limit: number },
): Promise<AgentVersionItem[]> {
    return db
        .selectFrom("agent_versions")
        .select([
            "version",
            "model",
            "tools",
            sql<string | null>`left(encode(sha256(convert_to(instructions, 'UTF8')), 'hex'), 16)`.as(
                "instructionsHash",
            ),
            "first_seen_at as firstSeenAt",
        ])
        .where("project_id", "=", projectId)
        .where("agent", "=", agent)
        .orderBy("first_seen_at", "desc")
        .orderBy("version", "desc")
        .limit(options.limit)
        .execute();
}
