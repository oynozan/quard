import { addDayCounts, takeDayCounts } from "@quard/db";
import type { CountMessage, UncountMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

// A call's per-day counts for the project, all added or none when one would pass its max
export async function count(ctx: Context, connection: Connection, message: CountMessage): Promise<void> {
    const { day, tool, counts } = message;
    const { ok, used } = await addDayCounts(ctx.db, connection.projectId, { day, tool }, counts);
    send(connection, { type: "counted", id: message.id, ok, used });
}

// Takes back the counts of a call refused after they went in, with no answer
export async function uncount(ctx: Context, connection: Connection, message: UncountMessage): Promise<void> {
    const { day, tool, counts } = message;
    await takeDayCounts(ctx.db, connection.projectId, { day, tool }, counts);
}
