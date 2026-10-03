// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, type Socket } from "./cdp";

// Plays the browser's side of the socket
class FakeSocket {
    listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
    sent: { id: number; method: string; params: object }[] = [];
    closed = false;
    addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type: string, data?: object) {
        for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    close() {
        this.closed = true;
    }
}

async function open() {
    const socket = new FakeSocket();
    const pending = connect("ws://chrome", () => socket as Socket);
    socket.emit("open");
    return { socket, cdp: await pending };
}

afterEach(() => vi.unstubAllGlobals());

describe("connect", () => {
    it("matches each answer to its request", async () => {
        const { socket, cdp } = await open();
        const first = cdp.send("Page.enable");
        const second = cdp.send("Page.navigate", { url: "http://x" });
        expect(socket.sent).toEqual([
            { id: 1, method: "Page.enable", params: {} },
            { id: 2, method: "Page.navigate", params: { url: "http://x" } },
        ]);
        socket.emit("message", { method: "Page.loadEventFired" });
        socket.emit("message", { id: 99, result: {} });
        socket.emit("message", { id: 2, result: { frameId: "f" } });
        socket.emit("message", { id: 1, error: { message: "not allowed" } });
        await expect(second).resolves.toEqual({ frameId: "f" });
        await expect(first).rejects.toThrow("not allowed");
    });

    it("closes the socket", async () => {
        const { socket, cdp } = await open();
        cdp.close();
        expect(socket.closed).toBe(true);
    });

    it("fails when the socket cannot open", async () => {
        const socket = new FakeSocket();
        const pending = connect("ws://chrome", () => socket as Socket);
        socket.emit("error");
        await expect(pending).rejects.toThrow("Could not connect to ws://chrome");
    });

    it("uses the built-in WebSocket by default", async () => {
        const made: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            class extends FakeSocket {
                constructor() {
                    super();
                    made.push(this);
                }
            },
        );
        const pending = connect("ws://chrome");
        made[0]?.emit("open");
        await expect(pending).resolves.toHaveProperty("send");
    });
});
