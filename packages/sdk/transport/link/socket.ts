import { connect as netConnect, isIP, type createConnection, type NetConnectOpts, type Socket } from "node:net";
import { connect as tlsConnect, type ConnectionOptions } from "node:tls";
import WebSocket from "ws";

export type SocketEvents = {
    open(): void;
    message(text: string): void;
    // Control pinged, so the connection is still alive
    alive(): void;
    // refused is true when control answered the upgrade with HTTP 401
    close(code: number, refused: boolean): void;
};

export type LinkSocket = {
    send(text: string): void;
    // Drops the connection at once
    close(): void;
    ref(): void;
    unref(): void;
};

export type OpenSocket = (url: string, key: string, events: SocketEvents) => LinkSocket;

type ConnectOptions = ConnectionOptions & { host?: string; socketPath?: string };

const HANDSHAKE_MS = 10_000;
// A long quarantine list comes from control in one ready message
const MAX_PAYLOAD = 64 * 1024 * 1024;

// Opens the TCP or TLS socket the way ws does, so the link can ref and unref it
export function rawSocket(secure: boolean, options: ConnectOptions): Socket {
    if (!secure) {
        return netConnect({ ...options, path: options.socketPath } as NetConnectOpts);
    }
    const host = options.host ?? "";
    return tlsConnect({ ...options, path: undefined, servername: options.servername ?? (isIP(host) ? "" : host) });
}

// One WebSocket to control, whose socket starts unref'd
export const openSocket: OpenSocket = (url, key, events) => {
    const secure = url.startsWith("wss:");
    let raw: Socket | undefined;
    let held = false;
    let refused = false;
    const hold = () => (held ? raw?.ref() : raw?.unref());
    const connect = (options: ConnectOptions): Socket => {
        raw = rawSocket(secure, options);
        hold();
        // Each try at another address gets a new handle, which starts ref'd
        raw.on("connectionAttempt", hold);
        raw.on("connect", hold);
        return raw;
    };
    const ws = new WebSocket(url, {
        headers: { authorization: `Bearer ${key}` },
        handshakeTimeout: HANDSHAKE_MS,
        maxPayload: MAX_PAYLOAD,
        perMessageDeflate: false,
        createConnection: connect as unknown as typeof createConnection,
    });
    ws.on("open", () => events.open());
    ws.on("message", (data, isBinary) => {
        if (!isBinary) {
            events.message(String(data));
        }
    });
    ws.on("ping", () => events.alive());
    ws.on("error", (error) => {
        refused ||= error.message.includes("Unexpected server response: 401");
    });
    ws.on("close", (code) => events.close(code, refused));
    return {
        send: (text) => ws.send(text),
        close: () => ws.terminate(),
        ref: () => {
            held = true;
            hold();
        },
        unref: () => {
            held = false;
            hold();
        },
    };
};
