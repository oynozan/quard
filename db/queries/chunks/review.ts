import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { LabelStat } from "./types.ts";

// The risk at which the SDK flags content by default (PROJECT.md "Thresholds")
export const FLAG_AT = 0.5;

// Saves the label a person says is right, and who said it. A later
// review replaces it. False when the project has no such chunk.
export async function reviewChunk(
    db: Db,
    projectId: string,
    eventId: string,
    label: string,
    by: string,
): Promise<boolean> {
    const result = await db
        .updateTable("chunk_labels")
        .set({ reviewed_label: label, reviewed_by: by, reviewed_at: sql<Date>`clock_timestamp()` })
        .where("project_id", "=", projectId)
        .where("event_id", "=", eventId)
        .executeTakeFirst();
    return result.numUpdatedRows > 0n;
}

const count = (filter: string) => sql<number>`count(*) FILTER (WHERE ${sql.raw(filter)})::int`;

// Per label the detector picked: chunks waiting, reviewed, and kept by the review
export async function labelStats(db: Db, projectId: string): Promise<LabelStat[]> {
    const flagged = `reviewed_at IS NOT NULL AND score >= ${FLAG_AT}`;
    return db
        .selectFrom("chunk_labels")
        .select([
            "label",
            count("reviewed_at IS NULL").as("open"),
            count("reviewed_at IS NOT NULL").as("reviewed"),
            count("reviewed_label = label").as("right"),
            count(flagged).as("flagged"),
            count(`${flagged} AND reviewed_label = label`).as("flaggedRight"),
        ])
        .where("project_id", "=", projectId)
        .groupBy("label")
        .orderBy("label")
        .execute();
}
