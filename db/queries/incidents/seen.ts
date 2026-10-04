import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// Records the first time someone opened the incident's page
export async function markIncidentSeen(db: Db, projectId: string, id: string): Promise<void> {
    await db
        .updateTable("incidents")
        .set({ seen_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .where("seen_at", "is", null)
        .execute();
}
