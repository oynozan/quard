import type { Db } from "../../connect/connect.ts";

// Whether the project has stored any run, so search can tell a new
// project from a search that found nothing
export async function hasRuns(db: Db, projectId: string): Promise<boolean> {
    const row = await db
        .selectFrom("runs")
        .select("run_id")
        .where("project_id", "=", projectId)
        .limit(1)
        .executeTakeFirst();
    return row !== undefined;
}
