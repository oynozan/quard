import { saveAgentVersion, type Db } from "@quard/db";

type VersionInput = Parameters<typeof saveAgentVersion>[2];

// An agent version control stored, first seen at a fixed time
export async function seenVersion(db: Db, projectId: string, input: VersionInput, firstSeenAt: number): Promise<void> {
    await saveAgentVersion(db, projectId, input);
    await db
        .updateTable("agent_versions")
        .set({ first_seen_at: new Date(firstSeenAt) })
        .where("project_id", "=", projectId)
        .where("agent", "=", input.agent)
        .where("version", "=", input.version)
        .execute();
}
