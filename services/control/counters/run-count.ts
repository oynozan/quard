import { addRunCount } from "@quard/db";
import type { RunCountMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

// A counter of a run that spans processes. With max it only adds while
// the run's total stays at or under it.
export async function runCount(ctx: Context, connection: Connection, message: RunCountMessage): Promise<void> {
    const { runId, counter, add, max } = message;
    const { ok, used } = await addRunCount(ctx.db, connection.projectId, runId, counter, add, max);
    send(connection, { type: "counted", id: message.id, ok, used });
}
