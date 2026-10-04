import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type ConfigErrorSource = "policy" | "signatures";

export type ConfigErrorInput = { source: ConfigErrorSource; message: string };

export type ConfigErrorRow = ConfigErrorInput & {
    firstSeenAt: Date;
    lastSeenAt: Date;
    count: number;
};

// Counts each reported error on its project, source and message row.
// ponytail: a batch resent after a lost reply counts its errors twice;
// key on event ids if that ever matters.
export async function recordConfigErrors(
    db: Db,
    projectId: string,
    errors: ConfigErrorInput[],
    at: Date,
): Promise<void> {
    // One row per key, since an insert can't update the same row twice
    const counts = new Map<string, ConfigErrorInput & { count: number }>();
    for (const { source, message } of errors) {
        const key = JSON.stringify([source, message]);
        counts.set(key, { source, message, count: (counts.get(key)?.count ?? 0) + 1 });
    }
    if (counts.size === 0) {
        return;
    }
    await db
        .insertInto("config_errors")
        .values(
            [...counts.values()].map(({ source, message, count }) => ({
                project_id: projectId,
                source,
                message,
                first_seen_at: at,
                last_seen_at: at,
                count,
            })),
        )
        .onConflict((conflict) =>
            conflict.columns(["project_id", "source", "message"]).doUpdateSet({
                first_seen_at: sql`LEAST(config_errors.first_seen_at, excluded.first_seen_at)`,
                last_seen_at: sql`GREATEST(config_errors.last_seen_at, excluded.last_seen_at)`,
                count: sql`config_errors.count + excluded.count`,
            }),
        )
        .execute();
}

// The project's config errors, the most recently seen first
export async function listConfigErrors(
    db: Db,
    projectId: string,
    options: { limit: number },
): Promise<ConfigErrorRow[]> {
    return db
        .selectFrom("config_errors")
        .select(["source", "message", "first_seen_at as firstSeenAt", "last_seen_at as lastSeenAt", "count"])
        .where("project_id", "=", projectId)
        .orderBy("last_seen_at", "desc")
        .orderBy("source")
        .orderBy("message")
        .limit(options.limit)
        .execute();
}
