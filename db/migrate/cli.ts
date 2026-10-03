import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "./runner.ts";

// Built from path parts, not `new URL("../migrations", import.meta.url)`: bundlers such as Next's
// treat that form as a file to bundle and fail on a folder.
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

// Returns the process exit code
export async function migrateFromEnv(
    env: Record<string, string | undefined>,
    log: (message: string) => void = console.log,
): Promise<number> {
    const url = env.DATABASE_URL;
    if (!url) {
        log("DATABASE_URL is not set");
        return 1;
    }
    const applied = await migrateDatabase(url);
    log(applied.length > 0 ? `Applied: ${applied.join(", ")}` : "No new migrations");
    return 0;
}

// Applies new migrations to the database at `url`
export async function migrateDatabase(url: string): Promise<string[]> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        return await runMigrations((sql, params) => client.query(sql, params), MIGRATIONS_DIR);
    } finally {
        await client.end();
    }
}
