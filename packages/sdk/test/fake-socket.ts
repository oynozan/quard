import { clientMessage, type ClientMessage, type ReadyMessage, type ServerMessage } from "@quard/shared";
import { createLink, type LinkTiming } from "../transport/link/link.ts";
import { PROJECT_KEY_TEXT } from "./hash-key.ts";
import type { LinkSocket, OpenSocket, SocketEvents } from "../transport/link/socket.ts";

export type FakeSocket = LinkSocket & {
    url: string;
    key: string;
    // Messages the SDK sent, parsed
    sent: ClientMessage[];
    // Sent messages control would refuse
    invalid: string[];
    held: boolean;
    closed: boolean;
    // What control would do
    accept(): void;
    reply(message: ServerMessage | string): void;
    ping(): void;
    drop(code?: number, refused?: boolean): void;
};

export const READY: ReadyMessage = {
    type: "ready",
    at: "2026-10-03T12:00:00.000Z",
    quarantine: [],
    fleetObserveUntil: null,
    counters: [],
    hashKey: PROJECT_KEY_TEXT,
};

// Sockets that tests drive by hand, where close() reports the close at once
export function fakeSockets() {
    const sockets: FakeSocket[] = [];
    let failNext = false;
    const open: OpenSocket = (url: string, key: string, events: SocketEvents) => {
        if (failNext) {
            failNext = false;
            throw new Error("socket refused to open");
        }
        const socket: FakeSocket = {
            url,
            key,
            sent: [],
            invalid: [],
            held: false,
            closed: false,
            send(text) {
                if (socket.closed) {
                    throw new Error("socket is closed");
                }
                const parsed = clientMessage.safeParse(JSON.parse(text));
                if (parsed.success) {
                    socket.sent.push(parsed.data);
                } else {
                    socket.invalid.push(text);
                }
            },
            close() {
                socket.drop();
            },
            ref() {
                socket.held = true;
            },
            unref() {
                socket.held = false;
            },
            accept: () => events.open(),
            reply: (message) => events.message(typeof message === "string" ? message : JSON.stringify(message)),
            ping: () => events.alive(),
            drop(code = 1006, refused = false) {
                if (!socket.closed) {
                    socket.closed = true;
                    events.close(code, refused);
                }
            },
        };
        sockets.push(socket);
        return socket;
    };
    const last = (): FakeSocket => {
        const socket = sockets.at(-1);
        if (socket === undefined) {
            throw new Error("no socket was opened");
        }
        return socket;
    };
    return {
        open,
        sockets,
        last,
        failNextOpen: () => {
            failNext = true;
        },
        // Opens the last socket and answers its hello
        connect(ready: ReadyMessage = READY): FakeSocket {
            const socket = last();
            socket.accept();
            socket.reply(ready);
            return socket;
        },
    };
}

// The messages of one type a socket sent. Throws if any message broke the protocol.
export function sentOf<T extends ClientMessage["type"]>(
    socket: FakeSocket,
    type: T,
): Array<Extract<ClientMessage, { type: T }>> {
    if (socket.invalid.length > 0) {
        throw new Error(`The SDK sent messages control would refuse: ${socket.invalid.join("\n")}`);
    }
    return socket.sent.filter((message): message is Extract<ClientMessage, { type: T }> => message.type === type);
}

export const HELLO: ClientMessage = {
    type: "hello",
    sdk: "0.0.0",
    host: "test-host",
    pid: 1,
    rules: { hash: "a".repeat(16), list: [] },
};

// A started link over fake sockets
export function fakeLink(timing?: Partial<LinkTiming>, warn: (message: string) => void = () => {}) {
    const fake = fakeSockets();
    const link = createLink({
        url: "ws://control.test/v1/connect",
        key: "qk_live_test",
        hello: () => HELLO,
        open: fake.open,
        warn,
        timing,
    });
    link.start();
    return { fake, link };
}
