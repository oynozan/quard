import type { ServerMessage } from "@quard/shared";
import { WebSocket } from "ws";

// A stand-in for a server-side ws socket that records what control does with it
export type FakeSocket = {
    readyState: number;
    sent: ServerMessage[];
    closedWith: { code: number; reason: string } | undefined;
    terminated: boolean;
    pings: number;
    send(text: string): void;
    close(code: number, reason: string): void;
    terminate(): void;
    ping(): void;
    // The messages of one type, in order
    of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[];
};

export function fakeSocket(): FakeSocket {
    const socket: FakeSocket = {
        readyState: WebSocket.OPEN,
        sent: [],
        closedWith: undefined,
        terminated: false,
        pings: 0,
        send(text) {
            socket.sent.push(JSON.parse(text) as ServerMessage);
        },
        close(code, reason) {
            socket.closedWith = { code, reason };
            socket.readyState = WebSocket.CLOSING;
        },
        terminate() {
            socket.terminated = true;
            socket.readyState = WebSocket.CLOSED;
        },
        ping() {
            socket.pings += 1;
        },
        of: <T extends ServerMessage["type"]>(type: T) =>
            socket.sent.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type),
    };
    return socket;
}

export function asSocket(fake: FakeSocket): WebSocket {
    return fake as unknown as WebSocket;
}
