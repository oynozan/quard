import type { Selectable } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { ChunkLabelsTable } from "../../schema/database.ts";
import type { ChunkItem } from "./types.ts";

type Row = Selectable<ChunkLabelsTable>;

export function chunkOf(row: Row): ChunkItem {
    return {
        eventId: row.event_id,
        runId: row.run_id,
        stepId: row.step_id,
        agent: row.agent,
        tool: row.tool,
        origin: row.origin,
        detector: row.detector,
        chunk: row.chunk,
        text: row.text,
        label: row.label,
        probabilities: row.probabilities as Record<string, number>,
        confidence: row.confidence,
        score: row.score,
        injection: row.injection,
        at: row.at,
        fallback:
            row.fallback_state === null
                ? null
                : {
                      state: row.fallback_state,
                      label: row.fallback_label,
                      reason: row.fallback_reason,
                      error: row.fallback_error,
                  },
        review:
            row.reviewed_label === null || row.reviewed_by === null || row.reviewed_at === null
                ? null
                : { label: row.reviewed_label, by: row.reviewed_by, at: row.reviewed_at },
    };
}

const chunks = (db: Db, projectId: string) =>
    db.selectFrom("chunk_labels").selectAll().where("project_id", "=", projectId);

// Chunks nobody reviewed yet, least sure first, then newest
export async function chunkQueue(db: Db, projectId: string, limit = 50): Promise<ChunkItem[]> {
    const rows = await chunks(db, projectId)
        .where("reviewed_at", "is", null)
        .orderBy("confidence", "asc")
        .orderBy("at", "desc")
        .orderBy("event_id")
        .limit(limit)
        .execute();
    return rows.map(chunkOf);
}

export async function countOpenChunks(db: Db, projectId: string): Promise<number> {
    const row = await db
        .selectFrom("chunk_labels")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("project_id", "=", projectId)
        .where("reviewed_at", "is", null)
        .executeTakeFirstOrThrow();
    return Number(row.count);
}

// The latest reviews, newest first
export async function reviewedChunks(db: Db, projectId: string, limit = 20): Promise<ChunkItem[]> {
    const rows = await chunks(db, projectId)
        .where("reviewed_at", "is not", null)
        .orderBy("reviewed_at", "desc")
        .orderBy("event_id")
        .limit(limit)
        .execute();
    return rows.map(chunkOf);
}
