import { dayCounts, fleetObserveUntil, openConnection, quarantineList, saveRules } from "@quard/db";
import type { HelloMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

// The SDK tries again later when control could not start the session
const INTERNAL_ERROR = 1011;

// "YYYY-MM-DD" in UTC, the day per-day limits count in
export function utcDay(at: Date): string {
    return at.toISOString().slice(0, 10);
}

// Stores the connection and its rules, then sends what the SDK needs to start
export async function hello(ctx: Context, connection: Connection, message: HelloMessage): Promise<void> {
    const { db } = ctx;
    const { projectId } = connection;
    try {
        const { sdk, host, pid } = message;
        connection.id = await openConnection(db, projectId, { keyId: connection.keyId, sdk, host, pid });
        await saveRules(db, projectId, connection.id, message.rules);
        const now = ctx.now();
        const observeUntil = await fleetObserveUntil(db, projectId);
        const counters = await dayCounts(db, projectId, utcDay(now));
        // In the project's turn, so no quarantine push slips in between the list and ready
        await ctx.fleet.inProject(projectId, async () => {
            const quarantine = await quarantineList(db, projectId);
            connection.known = new Map(quarantine.map((entry) => [entry.key, entry.observe]));
            send(connection, {
                type: "ready",
                at: now.toISOString(),
                quarantine,
                fleetObserveUntil: observeUntil?.toISOString() ?? null,
                counters,
                hashKey: ctx.keys.hashKey(projectId),
            });
            ctx.registry.ready(connection);
        });
    } catch (error) {
        ctx.log(`control: hello failed: ${(error as Error).message}`);
        connection.socket.close(INTERNAL_ERROR, "control could not start the session");
    }
}
