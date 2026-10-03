import { CompiledQuery, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Db } from "../connect/connect.ts";
import type { Database } from "../schema/database.ts";
import type { TestDb } from "./pglite.ts";

// The plan Postgres picks for the first query `use` runs, with what each step outputs
export async function planOf(test: TestDb, use: (db: Db) => Promise<unknown>): Promise<string> {
    const queries: CompiledQuery[] = [];
    const db = new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: test.url, max: 1 }) }),
        log: (event) => {
            queries.push(event.query);
        },
    });
    try {
        await use(db);
    } finally {
        await db.destroy();
    }
    const [query] = queries;
    if (!query) {
        throw new Error("No query ran");
    }
    const { rows } = await test.db.executeQuery<{ "QUERY PLAN": string }>(
        CompiledQuery.raw(`EXPLAIN (VERBOSE, COSTS OFF) ${query.sql}`, [...query.parameters]),
    );
    return rows.map((row) => row["QUERY PLAN"]).join("\n");
}
