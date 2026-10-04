import type { Db } from "../../connect/connect.ts";
import type { IncidentCategory, IncidentRow, StoredReplay, StoredVerdict } from "./types.ts";

const COLUMNS = [
    "id",
    "run_id as runId",
    "opened_at as openedAt",
    "seen_at as seenAt",
    "find_state as findState",
    "find_error as findError",
    "replay_state as replayState",
    "verdict",
    "replay",
    "spent_usd as spentUsd",
    "cap_usd as capUsd",
    "category",
    "damage_tool as damageTool",
    "damage_agent as damageAgent",
    "entry_agent as entryAgent",
    "entry_origin as entryOrigin",
    "entry_trust as entryTrust",
    "turning_agent as turningAgent",
] as const;

// jsonb comes back untyped. The worker wrote these shapes.
type Narrowed = {
    verdict: StoredVerdict | null;
    replay: StoredReplay | null;
    category: IncidentCategory | null;
};

function incidents(db: Db, projectId: string) {
    return db
        .selectFrom("incidents")
        .select(COLUMNS)
        .$narrowType<Narrowed>()
        .where("project_id", "=", projectId)
        .orderBy("opened_at", "desc")
        .orderBy("id", "desc");
}

// Newest first
export async function listIncidents(db: Db, projectId: string, options: { limit: number }): Promise<IncidentRow[]> {
    return incidents(db, projectId).limit(options.limit).execute();
}

export async function getIncident(db: Db, projectId: string, id: string): Promise<IncidentRow | undefined> {
    return incidents(db, projectId).where("id", "=", id).executeTakeFirst();
}

// The incidents an agent took part in, as entry, turning point or damage. Newest first.
export async function incidentsForAgent(db: Db, projectId: string, agent: string): Promise<IncidentRow[]> {
    return incidents(db, projectId)
        .where((eb) =>
            eb.or([eb("entry_agent", "=", agent), eb("turning_agent", "=", agent), eb("damage_agent", "=", agent)]),
        )
        .execute();
}

export async function incidentsForRuns(
    db: Db,
    projectId: string,
    runIds: string[],
): Promise<{ runId: string; id: string }[]> {
    if (runIds.length === 0) {
        return [];
    }
    return db
        .selectFrom("incidents")
        .select(["run_id as runId", "id"])
        .where("project_id", "=", projectId)
        .where("run_id", "in", runIds)
        .execute();
}
