import { sql, type RawBuilder } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { Database } from "../../schema/database.ts";
import { inBatches, type Stopped } from "./batch.ts";
import { BATCH } from "./policy.ts";

// One project's cleanup pass
export type Sweep = {
    db: Db;
    projectId: string;
    now: Date;
    // Runs and their records last touched before this are past their days
    runCutoff: Date;
    stopped: Stopped;
};

// Deletes the project's rows of `table` that match `where`, in batches.
// `key` names the columns that pick a row; `where` calls the row `x`.
export function deleteWhere(
    sweep: Sweep,
    table: keyof Database,
    key: string,
    where: RawBuilder<boolean>,
    size: number = BATCH.rows,
): Promise<number> {
    const columns = sql.raw(key);
    return inBatches(
        size,
        (limit) =>
            sweep.db
                .deleteFrom(table)
                .where(
                    sql<boolean>`(${columns}) IN (SELECT ${columns} FROM ${sql.table(table)} x
                        WHERE x.project_id = ${sweep.projectId} AND ${where} LIMIT ${limit})`,
                )
                .executeTakeFirst(),
        sweep.stopped,
    );
}
