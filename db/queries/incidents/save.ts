import type { Db } from "../../connect/connect.ts";
import { fromNow } from "./jobs.ts";
import type { StoredReplay, StoredVerdict } from "./types.ts";

// How long a running replay keeps its lease after each round
const REPLAY_LEASE_MS = 10 * 60_000;

function incident(db: Db, projectId: string, id: string) {
    return db.updateTable("incidents").where("project_id", "=", projectId).where("id", "=", id);
}

// Stores the verdict, with the fields lists filter on, and frees the row
export async function saveVerdict(db: Db, projectId: string, id: string, verdict: StoredVerdict): Promise<void> {
    await incident(db, projectId, id)
        .set({
            find_state: "done",
            find_error: null,
            verdict: JSON.stringify(verdict),
            category: verdict.category,
            damage_step_id: verdict.damage.stepId,
            damage_tool: verdict.damage.tool,
            damage_agent: verdict.damage.agent,
            entry_agent: verdict.entry.agent,
            entry_origin: verdict.entry.origin,
            entry_trust: verdict.entry.trust,
            turning_agent: verdict.turning.agent,
            leased_until: null,
            attempts: 0,
            errors: 0,
        })
        .execute();
}

export async function failFind(db: Db, projectId: string, id: string, error: string): Promise<void> {
    await incident(db, projectId, id)
        .set({ find_state: "failed", find_error: error, leased_until: null, attempts: 0, errors: 0 })
        .execute();
}

// Saves replay progress after each round, and its end. spentUsd is the new total.
export async function saveReplay(
    db: Db,
    projectId: string,
    id: string,
    replay: StoredReplay,
    spentUsd: number,
    state: "running" | "done" | "failed",
    leaseMs = REPLAY_LEASE_MS,
): Promise<void> {
    const running = state === "running";
    await incident(db, projectId, id)
        .set({
            replay: JSON.stringify(replay),
            spent_usd: spentUsd,
            replay_state: state,
            leased_until: running ? fromNow(leaseMs) : null,
            ...(running ? {} : { attempts: 0, errors: 0 }),
        })
        .execute();
}
