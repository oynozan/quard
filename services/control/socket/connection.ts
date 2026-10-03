import type { AgentKeyMatch } from "@quard/db";
import { CLOSE_CODES } from "@quard/shared";
import type { RawData, WebSocket } from "ws";
import { ignore } from "../common/ignore.ts";
import { closed } from "../connect/rules.ts";
import type { Context } from "../server/context.ts";
import { CONNECTION_LIMITS } from "./limits.ts";
import { receive } from "./receive.ts";
import type { Connection } from "./registry.ts";

function enqueue(connection: Connection, task: () => Promise<void>): void {
    connection.queue = connection.queue.then(task);
}

// A burst waits in the network, not in memory: reading stops while the queue is long
function onMessage(ctx: Context, connection: Connection, data: RawData): void {
    connection.queued += 1;
    if (connection.queued >= CONNECTION_LIMITS.pause) {
        connection.socket.pause();
    }
    enqueue(connection, () =>
        receive(ctx, connection, String(data)).finally(() => {
            connection.queued -= 1;
            if (connection.queued <= CONNECTION_LIMITS.resume) {
                connection.socket.resume();
            }
        }),
    );
}

// Messages from one socket are handled one at a time, in order
export function acceptConnection(ctx: Context, socket: WebSocket, match: AgentKeyMatch): Connection {
    const connection = ctx.registry.add(socket, match);
    const helloTimer = setTimeout(() => {
        if (!connection.greeted) {
            socket.close(CLOSE_CODES.badHello, "hello expected");
        }
    }, ctx.timing.helloMs);
    helloTimer.unref();
    socket.on("message", (data) => onMessage(ctx, connection, data));
    socket.on("pong", () => {
        connection.alive = true;
    });
    // ws closes the socket right after an error, such as a message over the size limit
    socket.on("error", ignore);
    socket.on("close", () => {
        clearTimeout(helloTimer);
        ctx.registry.remove(connection);
        enqueue(connection, () => closed(ctx, connection));
    });
    return connection;
}
