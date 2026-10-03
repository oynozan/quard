import { findMemoryRecords, findMessageRecord } from "@quard/db";
import type { LabelRecord, LookupMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

async function recordsFor(ctx: Context, projectId: string, target: LookupMessage["target"]): Promise<LabelRecord[]> {
    if (target.kind === "memory") {
        return findMemoryRecords(ctx.db, projectId, target.print);
    }
    const found = await findMessageRecord(ctx.db, projectId, target.ref);
    return found === undefined ? [] : [found];
}

// The labels behind a message's reference or a memory item's print, from
// the connection's project only. No records means nothing vouches for it.
export async function lookup(ctx: Context, connection: Connection, message: LookupMessage): Promise<void> {
    const records = await recordsFor(ctx, connection.projectId, message.target);
    send(connection, { type: "labels", id: message.id, records });
}
