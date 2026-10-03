import type { ServerMessage } from "@quard/shared";
import { WebSocket } from "ws";
import type { Connection } from "./registry.ts";

export type ErrorCode = "bad_message" | "hello_required" | "duplicate_hello" | "server_error" | "too_many_waiters";

// A message for a socket that is closing or closed is dropped
export function send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(message));
    }
}

// With the id of the request it answers, so the SDK stops waiting for it
export function sendError(connection: Connection, code: ErrorCode, message: string, id?: string): void {
    send(connection, { type: "error", code, message, id });
}
