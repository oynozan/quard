import { CLOSE_CODES, serverMessage, type ClientMessage, type ReadyMessage, type ServerMessage } from "@quard/shared";
import { openSocket, type LinkSocket, type OpenSocket, type SocketEvents } from "./socket.ts";

export type LinkListener = {
    // Control answered hello, on the first connect and after each reconnect
    ready?(message: ReadyMessage): void;
    message?(message: ServerMessage): void;
    // A ready connection was lost
    down?(): void;
};

export type LinkTiming = {
    // The wait before the first retry, doubling up to maxDelay
    firstDelay: number;
    maxDelay: number;
    // How long control may take to answer hello
    readyMs: number;
    // Control pings every 30 s, so this much silence means a dead link
    silentMs: number;
};

export const LINK_TIMING: LinkTiming = { firstDelay: 1_000, maxDelay: 15_000, readyMs: 10_000, silentMs: 75_000 };

// Control drops connections that send more than 1 MB at once
export const MAX_MESSAGE = 1_000_000;

export type LinkOptions = {
    url: string;
    key: string;
    hello: () => ClientMessage;
    open?: OpenSocket;
    warn?: (message: string) => void;
    timing?: Partial<LinkTiming>;
};

export type Link = {
    start(): void;
    stop(): void;
    // Control answered hello and the connection is up
    ready(): boolean;
    // False when the message can't go out now
    send(message: ClientMessage): boolean;
    // Keeps the process alive until the returned function is called
    hold(): () => void;
    listen(listener: LinkListener): void;
};

function parse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

// The one WebSocket to control, which only keeps the process alive while held
export function createLink(options: LinkOptions): Link {
    const open = options.open ?? openSocket;
    const warn = options.warn ?? console.warn;
    const timing = { ...LINK_TIMING, ...options.timing };
    const listeners: LinkListener[] = [];
    let state: "stopped" | "waiting" | "connecting" | "ready" = "stopped";
    let socket: LinkSocket | undefined;
    let retry: NodeJS.Timeout | undefined;
    let watch: NodeJS.Timeout | undefined;
    let delay = timing.firstDelay;
    let holds = 0;
    let warned = false;

    function emit(call: (listener: LinkListener) => void): void {
        for (const listener of listeners) {
            try {
                call(listener);
            } catch {
                // One broken listener must not stop the others
            }
        }
    }

    function refs(): void {
        if (holds > 0) {
            socket?.ref();
            retry?.ref();
        } else {
            socket?.unref();
            retry?.unref();
        }
    }

    // Drops the connection when control stays silent for too long
    function watchFor(target: LinkSocket, ms: number): void {
        clearTimeout(watch);
        watch = setTimeout(() => target.close(), ms);
        watch.unref();
    }

    function write(target: LinkSocket, message: ClientMessage): boolean {
        const text = JSON.stringify(message);
        if (Buffer.byteLength(text) > MAX_MESSAGE) {
            return false;
        }
        try {
            target.send(text);
            return true;
        } catch {
            return false;
        }
    }

    function receive(target: LinkSocket, text: string): void {
        const parsed = serverMessage.safeParse(parse(text));
        if (!parsed.success) {
            return;
        }
        const message = parsed.data;
        if (state === "ready") {
            watchFor(target, timing.silentMs);
            if (message.type !== "ready") {
                emit((listener) => listener.message?.(message));
            }
        } else if (message.type === "ready") {
            state = "ready";
            delay = timing.firstDelay;
            watchFor(target, timing.silentMs);
            emit((listener) => listener.ready?.(message));
        }
    }

    function closed(code: number, refused: boolean): void {
        const wasReady = state === "ready";
        socket = undefined;
        clearTimeout(watch);
        if ((refused || code === CLOSE_CODES.revoked) && !warned) {
            warned = true;
            warn("Quard: control refused the agent key. Check that the key is valid and not revoked.");
        }
        state = "waiting";
        if (wasReady) {
            emit((listener) => listener.down?.());
        }
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, timing.maxDelay);
        refs();
    }

    function connect(): void {
        retry = undefined;
        state = "connecting";
        const events: SocketEvents = {
            open: () => {
                if (current === socket) {
                    write(current, options.hello());
                    watchFor(current, timing.readyMs);
                }
            },
            message: (text) => {
                if (current === socket) {
                    receive(current, text);
                }
            },
            alive: () => {
                if (current === socket && state === "ready") {
                    watchFor(current, timing.silentMs);
                }
            },
            close: (code, refused) => {
                if (current === socket) {
                    closed(code, refused);
                }
            },
        };
        let current: LinkSocket;
        try {
            current = open(options.url, options.key, events);
        } catch {
            closed(1006, false);
            return;
        }
        socket = current;
        refs();
    }

    function hold(): () => void {
        holds += 1;
        refs();
        let held = true;
        return () => {
            if (held) {
                held = false;
                holds -= 1;
                refs();
            }
        };
    }

    return {
        start: () => {
            if (state === "stopped") {
                connect();
            }
        },
        stop: () => {
            state = "stopped";
            clearTimeout(retry);
            clearTimeout(watch);
            retry = undefined;
            const current = socket;
            socket = undefined;
            current?.close();
        },
        ready: () => state === "ready",
        send: (message) => state === "ready" && socket !== undefined && write(socket, message),
        hold,
        listen: (listener) => {
            listeners.push(listener);
        },
    };
}
