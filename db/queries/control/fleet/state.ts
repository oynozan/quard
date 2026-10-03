import type { QuarantineEntry } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../../connect/connect.ts";
import { CHANNELS, notify } from "../../../notify/channels.ts";
import { observeEnd } from "./window.ts";

// The project's quarantine list, as control syncs it to every SDK
export async function quarantineList(db: Db, projectId: string): Promise<QuarantineEntry[]> {
    return db
        .selectFrom("fleet_values")
        .select(["key", "observe"])
        .where("project_id", "=", projectId)
        .where("quarantined_at", "is not", null)
        .orderBy("key")
        .execute();
}

// Until when the fleet check only observes. Null before its first use.
export async function fleetObserveUntil(db: Db, projectId: string): Promise<Date | null> {
    const project = await db
        .selectFrom("projects")
        .select("fleet_started_at")
        .where("id", "=", projectId)
        .executeTakeFirst();
    const started = project?.fleet_started_at ?? null;
    return started === null ? null : observeEnd(started);
}

// Someone checked a value and says it is fine. It leaves the quarantine and
// is never quarantined again. The first person to mark it stays on record.
export async function markValueKnown(db: Db, projectId: string, key: string, by: string): Promise<boolean> {
    return db.transaction().execute(async (trx) => {
        const row = await trx
            .updateTable("fleet_values")
            .set({
                known_at: sql<Date>`coalesce(known_at, now())`,
                known_by: sql<string>`coalesce(known_by, ${by})`,
                quarantined_at: null,
                observe: false,
            })
            .where("project_id", "=", projectId)
            .where("key", "=", key)
            .returning("key")
            .executeTakeFirst();
        if (row === undefined) {
            return false;
        }
        // Control reloads the list and tells the SDKs
        await notify(trx, CHANNELS.fleet, projectId);
        return true;
    });
}
