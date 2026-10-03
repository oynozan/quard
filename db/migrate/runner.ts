import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

// Any fixed number works; it stops two runners from overlapping
const LOCK_ID = 7231;

export async function listMigrations(dir: string): Promise<string[]> {
    const names = await readdir(dir);
    return names.filter((name) => name.endsWith(".sql")).sort();
}

// Runs each new .sql file once, in name order, inside a transaction
export async function runMigrations(query: Query, dir: string): Promise<string[]> {
    await query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    try {
        await query(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
        );
        const { rows } = await query("SELECT name FROM schema_migrations");
        const done = new Set(rows.map((row) => String(row.name)));
        const applied: string[] = [];

        for (const name of await listMigrations(dir)) {
            if (done.has(name)) {
                continue;
            }
            const sql = await readFile(join(dir, name), "utf8");
            await query("BEGIN");
            try {
                await query(sql);
                await query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
                await query("COMMIT");
            } catch (error) {
                await query("ROLLBACK");
                throw error;
            }
            applied.push(name);
        }
        return applied;
    } finally {
        await query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    }
}
