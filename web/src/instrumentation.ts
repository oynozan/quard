// Next calls this once when the server starts, before it serves a request. The database code is
// Node-only, so it is imported behind the runtime check Next uses to keep it out of the Edge bundle.
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { migrateOnStart } = await import("./lib/db/migrate-on-start");
        await migrateOnStart();
    }
}
