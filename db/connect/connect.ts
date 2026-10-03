import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "../schema/database.ts";

export type Db = Kysely<Database>;

// One pool per process. Call db.destroy() to close it.
export function connect(url: string, max = 10): Db {
    const pool = new pg.Pool({ connectionString: url, max });
    // An idle connection that drops, for example on a database restart, is
    // replaced on next use. Without a listener it would crash the process.
    pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`));
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
