import { STATUS_CODES, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { agentKeyFor, type AgentKeyMatch } from "@quard/db";
import { bearerToken } from "@quard/db/server";
import { CONTROL_PATH } from "@quard/shared";
import type { WebSocketServer } from "ws";
import { ignore } from "../common/ignore.ts";
import type { Context } from "../server/context.ts";
import { acceptConnection } from "./connection.ts";

// Answers the upgrade with a plain HTTP status and no WebSocket, then drops the socket
// even if the client keeps its side open
function refuse(socket: Duplex, status: number): void {
    socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () =>
        socket.destroy(),
    );
}

async function upgrade(
    ctx: Context,
    wss: WebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
): Promise<void> {
    // The client may leave while its key is checked
    socket.on("error", ignore);
    if (String(request.url).split("?")[0] !== CONTROL_PATH) {
        return refuse(socket, 404);
    }
    const key = bearerToken(request.headers.authorization);
    let match: AgentKeyMatch | undefined;
    try {
        match = key === undefined ? undefined : await agentKeyFor(ctx.db, key);
    } catch (error) {
        ctx.log(`control: could not check an agent key: ${(error as Error).message}`);
        return refuse(socket, 503);
    }
    if (match === undefined) {
        return refuse(socket, 401);
    }
    const found = match;
    wss.handleUpgrade(request, socket, head, (ws) => acceptConnection(ctx, ws, found));
}

// The agent key is checked before the upgrade, so a bad or revoked key never gets a WebSocket
export function handleUpgrades(ctx: Context, server: Server, wss: WebSocketServer): void {
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        void upgrade(ctx, wss, request, socket, head);
    });
}
