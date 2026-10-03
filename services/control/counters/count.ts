import { addDayCount } from "@quard/db";
import type { CountMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

// With max it only adds while the project's total for the day stays at or under it
export async function count(ctx: Context, connection: Connection, message: CountMessage): Promise<void> {
    const { day, tool, counter, add, max } = message;
    const { ok, used } = await addDayCount(ctx.db, connection.projectId, { day, tool, counter, add, max });
    send(connection, { type: "counted", id: message.id, ok, used });
}
