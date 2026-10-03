import { CONTROL_PATH, type ReadyMessage, type ServerMessage } from "@quard/shared";
import { WebSocket, type ClientOptions } from "ws";
import { helloMessage } from "./messages.ts";

type Of<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

type Want = { test(message: ServerMessage): boolean; resolve(message: ServerMessage): void };

export type Client = {
    socket: WebSocket;
    // Messages that no next() took yet
    pending: ServerMessage[];
    send(message: unknown): void;
    // The first message of this type not taken yet, received or still to come
    next<T extends ServerMessage["type"]>(type: T, match?: (message: Of<T>) => boolean): Promise<Of<T>>;
    // Sends hello and waits for ready
    hello(): Promise<ReadyMessage>;
    closed: Promise<{ code: number; reason: string }>;
    close(): Promise<void>;
};

export function socketUrl(port: number, path = CONTROL_PATH): string {
    return `ws://127.0.0.1:${port}${path}`;
}

// An SDK stand-in that speaks the protocol over a real WebSocket
export function openClient(port: number, key: string, options: ClientOptions = {}): Promise<Client> {
    const socket = new WebSocket(socketUrl(port), { headers: { authorization: `Bearer ${key}` }, ...options });
    const pending: ServerMessage[] = [];
    const wants: Want[] = [];
    socket.on("message", (data) => {
        const message = JSON.parse(String(data)) as ServerMessage;
        const want = wants.find((candidate) => candidate.test(message));
        if (want === undefined) {
            pending.push(message);
            return;
        }
        wants.splice(wants.indexOf(want), 1);
        want.resolve(message);
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
        socket.on("close", (code, reason) => resolve({ code, reason: String(reason) })),
    );
    function next<T extends ServerMessage["type"]>(type: T, match: (message: Of<T>) => boolean = () => true) {
        const test = (message: ServerMessage) => message.type === type && match(message as Of<T>);
        const found = pending.find(test);
        if (found !== undefined) {
            pending.splice(pending.indexOf(found), 1);
            return Promise.resolve(found as Of<T>);
        }
        return new Promise<Of<T>>((resolve) => {
            wants.push({ test, resolve: (message) => resolve(message as Of<T>) });
        });
    }
    const client: Client = {
        socket,
        pending,
        send: (message) => socket.send(typeof message === "string" ? message : JSON.stringify(message)),
        next,
        hello: () => {
            client.send(helloMessage());
            return next("ready");
        },
        closed,
        close: async () => {
            if (socket.readyState !== WebSocket.CLOSED) {
                socket.close();
                await closed;
            }
        },
    };
    return new Promise((resolve, reject) => {
        socket.once("open", () => resolve(client));
        socket.once("error", reject);
    });
}

// The HTTP status control answers an upgrade with, when it refuses it
export function refusedWith(port: number, headers: Record<string, string>, path = CONTROL_PATH): Promise<number> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(socketUrl(port, path), { headers });
        socket.on("unexpected-response", (request, response) => {
            resolve(Number(response.statusCode));
            request.destroy();
        });
        socket.on("open", () => {
            reject(new Error("control accepted the upgrade"));
            socket.terminate();
        });
        socket.on("error", () => undefined);
    });
}

export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
