import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "./runner.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

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
