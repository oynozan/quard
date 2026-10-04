import type { ClientMessage } from "@quard/shared";
import { WebSocket } from "ws";
import { ask, beat, cancel } from "../approvals/ask.ts";
import { hello } from "../connect/hello.ts";
import { agent, rules } from "../connect/rules.ts";
import { count, uncount } from "../counters/count.ts";
import { runCount } from "../counters/run-count.ts";
import { fleet } from "../fleet/record.ts";
import { lookup } from "../labels/lookup.ts";
import type { Context } from "../server/context.ts";
import { parseMessage, replyId } from "./parse.ts";
import type { Connection } from "./registry.ts";
import { sendError } from "./send.ts";

type SessionMessage = Exclude<ClientMessage, { type: "hello" }>;

function route(ctx: Context, connection: Connection, message: SessionMessage): Promise<void> {
    switch (message.type) {
        case "rules":
            return rules(ctx, connection, message);
        case "agent":
            return agent(ctx, connection, message);
        case "ask":
            return ask(ctx, connection, message);
        case "beat":
            return beat(ctx, connection, message);
        case "cancel":
            return cancel(ctx, connection, message);
        case "count":
            return count(ctx, connection, message);
        case "uncount":
            return uncount(ctx, connection, message);
        case "fleet":
            return fleet(ctx, connection, message);
        case "lookup":
            return lookup(ctx, connection, message);
        case "run_count":
            return runCount(ctx, connection, message);
    }
}

// Never throws, and skips messages once the socket is closing, since a reply could not
// reach the SDK and it sends them again after it reconnects
export async function receive(ctx: Context, connection: Connection, text: string): Promise<void> {
    if (connection.closed || connection.socket.readyState !== WebSocket.OPEN) {
        return;
    }
    const parsed = parseMessage(text);
    if (!parsed.ok) {
        sendError(connection, "bad_message", parsed.error, parsed.id);
        return;
    }
    const { message } = parsed;
    if (message.type === "hello") {
        if (connection.greeted) {
            sendError(connection, "duplicate_hello", "hello was already sent on this connection");
            return;
        }
        connection.greeted = true;
        await hello(ctx, connection, message);
        return;
    }
    if (!connection.ready) {
        sendError(connection, "hello_required", "Send hello first", replyId(message));
        return;
    }
    try {
        await route(ctx, connection, message);
    } catch (error) {
        ctx.log(`control: a ${message.type} message failed: ${(error as Error).message}`);
        sendError(connection, "server_error", "Control could not handle the message", replyId(message));
    }
}
