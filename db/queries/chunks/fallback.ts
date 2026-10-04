import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { fromNow } from "../incidents/jobs.ts";
import type { FallbackJob, FallbackResult } from "./types.ts";

// A chunk whose job keeps failing stops after this many tries
export const MAX_FALLBACK_ATTEMPTS = 3;

const DUE = sql`fallback_state = 'pending' AND (leased_until IS NULL OR leased_until < now())
    AND attempts < ${MAX_FALLBACK_ATTEMPTS}`;

// Leases the oldest chunk that waits for the AI fallback. SKIP LOCKED
// lets workers claim side by side.
export async function claimFallbackJob(db: Db, leaseMs: number): Promise<FallbackJob | undefined> {
    return db
        .updateTable("chunk_labels")
        .set({ leased_until: fromNow(leaseMs), attempts: sql<number>`attempts + 1` })
        .where(
            sql<boolean>`(project_id, event_id) = (SELECT project_id, event_id FROM chunk_labels
                WHERE ${DUE} ORDER BY at LIMIT 1 FOR UPDATE SKIP LOCKED)`,
        )
        .returning(["project_id as projectId", "event_id as eventId", "text", "attempts"])
        .executeTakeFirst();
}

// Stores the fallback's label, its error, or that it was skipped
export async function saveFallback(db: Db, projectId: string, eventId: string, result: FallbackResult): Promise<void> {
    const set =
        result === null
            ? { fallback_state: "skipped" as const }
            : "error" in result
              ? { fallback_state: "failed" as const, fallback_error: result.error }
              : {
                    fallback_state: "done" as const,
                    fallback_label: result.label,
                    fallback_reason: result.reason,
                    fallback_model: result.model,
                    fallback_cost_usd: result.costUsd,
                    fallback_error: null,
                };
    await db
        .updateTable("chunk_labels")
        .set({ ...set, leased_until: null })
        .where("project_id", "=", projectId)
        .where("event_id", "=", eventId)
        .execute();
}
