import { recordFleetUse } from "@quard/db";
import type { FleetMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";
import { tell } from "./sync.ts";

// Replies with this call's quarantined values and tells the project's SDKs about new ones
export async function fleet(ctx: Context, connection: Connection, message: FleetMessage): Promise<void> {
    const { projectId } = connection;
    const { runId, agent, tool, blocked, values } = message;
    const result = await recordFleetUse(ctx.db, projectId, { runId, agent, tool, blocked, values }, ctx.now());
    await ctx.fleet.inProject(projectId, async () => {
        // The SDK adds the reply's entries to its copy itself
        for (const entry of result.quarantined) {
            connection.known.set(entry.key, entry.observe);
        }
        send(connection, {
            type: "fleet_result",
            id: message.id,
            quarantined: result.quarantined,
            fleetObserveUntil: result.observeUntil.toISOString(),
        });
        for (const other of ctx.registry.inProject(projectId)) {
            tell(other, result.added);
        }
    });
}
