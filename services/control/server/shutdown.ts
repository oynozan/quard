import type { Server } from "node:http";
import type { WebSocket } from "ws";
import type { Context } from "./context.ts";

// The SDK reconnects, ideally to another control instance
const GOING_AWAY = 1001;

function closedSocket(socket: WebSocket): Promise<void> {
    return new Promise((resolve) => socket.once("close", () => resolve()));
}

// Waits until every connection has recorded its close, dropping sockets still silent after closeMs
export async function closeSockets(ctx: Context): Promise<void> {
    const open = ctx.registry.connections();
    const gone = open.map((connection) => closedSocket(connection.socket));
    for (const connection of open) {
        connection.socket.close(GOING_AWAY, "control is shutting down");
    }
    const timer = setTimeout(() => open.forEach((connection) => connection.socket.terminate()), ctx.timing.closeMs);
    await Promise.all(gone);
    clearTimeout(timer);
    await Promise.all(open.map((connection) => connection.queue));
}

export function closeServer(server: Server): Promise<void> {
    return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
    });
}
