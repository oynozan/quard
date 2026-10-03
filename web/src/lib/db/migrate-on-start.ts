import { migrateDatabase } from "@quard/db/migrate";

// Brings the database schema up to date when the server starts, so no page meets a missing table.
// It is idempotent and guarded by a lock in the database, so it is safe beside the compose migrate step.
export async function migrateOnStart(env: Record<string, string | undefined> = process.env): Promise<void> {
    if (!env.DATABASE_URL) return;
    try {
        const applied = await migrateDatabase(env.DATABASE_URL);
        if (applied.length > 0) console.log(`[db] Applied migrations: ${applied.join(", ")}`);
    } catch (error) {
        // A database that is down must not stop the server; pages show their own error state.
        console.error("[db] Migrations could not run:", error instanceof Error ? error.message : error);
    }
}
