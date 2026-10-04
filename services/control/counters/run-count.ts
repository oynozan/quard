import { addRunCounts } from "@quard/db";
import type { RunCountMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

// Counters of a run that spans processes, for one call: all of them are
// added, or none when one would pass its max
export async function runCount(ctx: Context, connection: Connection, message: RunCountMessage): Promise<void> {
    const { ok, used } = await addRunCounts(ctx.db, connection.projectId, message.runId, message.counts);
    send(connection, { type: "run_counted", id: message.id, ok, used });
}
