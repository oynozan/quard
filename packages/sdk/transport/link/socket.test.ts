import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../../test/control-server.ts";
import { HELLO } from "../../test/fake-socket.ts";
import { openSocket, rawSocket, type SocketEvents } from "./socket.ts";

let server: ControlServer | undefined;
let tcp: Server | undefined;

afterEach(async () => {
    await server?.close();
    server = undefined;
    await new Promise((resolve) => (tcp === undefined ? resolve(undefined) : tcp.close(resolve)));
    tcp = undefined;
});

function events(): SocketEvents & { opened: Promise<void>; closed: Promise<[number, boolean]> } {
    let open = () => {};
    let close = (_: [number, boolean]) => {};
    return {
        opened: new Promise((resolve) => (open = resolve)),
        closed: new Promise((resolve) => (close = resolve)),
        open: () => open(),
        message: vi.fn(),
        alive: vi.fn(),
        close: (code, refused) => close([code, refused]),
    };
}

const socketUrl = (url: string) => `${url.replace("http:", "ws:")}/v1/connect`;

// Sockets that keep the event loop alive right now
function liveSockets(): number {
    return process.getActiveResourcesInfo().filter((type) => type === "TCPSocketWrap").length;
}

// Sockets of the test before can take a moment to close
async function settledSockets(): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return liveSockets();
}

// A plain TCP server that hands over the first bytes a client sends
async function firstBytes(): Promise<{ port: number; received: Promise<Buffer> }> {
    let deliver = (_: Buffer) => {};
    const received = new Promise<Buffer>((resolve) => (deliver = resolve));
    tcp = createServer((socket: Socket) => {
        socket.once("data", (data) => {
            deliver(data);
            socket.destroy();
        });
    });
    await new Promise<void>((resolve) => tcp?.listen(0, "127.0.0.1", resolve));
    const address = tcp.address();
    return { port: typeof address === "object" && address !== null ? address.port : 0, received };
}

describe("openSocket", () => {
    it("sends the agent key, and passes text both ways", async () => {
        server = await startControlServer();
        const seen = events();

        const socket = openSocket(socketUrl(server.url), CONTROL_KEY, seen);
        await seen.opened;
        socket.send(JSON.stringify(HELLO));
        await server.waitFor("hello");
        await vi.waitFor(() => expect(seen.message).toHaveBeenCalled());

        expect(JSON.parse(String(vi.mocked(seen.message).mock.calls[0]?.[0]))).toMatchObject({ type: "ready" });
        socket.close();
        expect((await seen.closed)[1]).toBe(false);
    });

    it("ignores binary messages and reports pings", async () => {
        server = await startControlServer();
        const seen = events();
        openSocket(socketUrl(server.url), CONTROL_KEY, seen);
        await seen.opened;
        await vi.waitFor(() => expect(server?.connections()).toHaveLength(1));

        const [peer] = server.connections();
        peer?.send(Buffer.from([1, 2, 3]));
        peer?.ping();
        await vi.waitFor(() => expect(seen.alive).toHaveBeenCalled());

        expect(seen.message).not.toHaveBeenCalled();
    });

    it("reports a key control refuses", async () => {
        server = await startControlServer();
        const seen = events();

        openSocket(socketUrl(server.url), "qk_live_wrong", seen);

        expect(await seen.closed).toEqual([1006, true]);
    });

    it("keeps the process alive only while held", async () => {
        server = await startControlServer();
        const seen = events();
        const before = await settledSockets();

        const socket = openSocket(socketUrl(server.url), CONTROL_KEY, seen);
        socket.ref();
        socket.unref();
        await seen.opened;
        await vi.waitFor(() => expect(server?.connections()).toHaveLength(1));
        // Only control's end of the connection counts
        expect(liveSockets()).toBe(before + 1);

        socket.ref();
        expect(liveSockets()).toBe(before + 2);
        socket.unref();
        expect(liveSockets()).toBe(before + 1);
        socket.close();
        await seen.closed;
    });

    it("keeps its hold when it connects through another address of the host", async () => {
        server = await startControlServer();
        const port = new URL(server.url).port;
        const before = await settledSockets();

        // localhost tries ::1 first, while control only listens on 127.0.0.1
        const idle = events();
        const unheld = openSocket(`ws://localhost:${port}/v1/connect`, CONTROL_KEY, idle);
        await idle.opened;
        await vi.waitFor(() => expect(server?.connections()).toHaveLength(1));
        expect(liveSockets()).toBe(before + 1);

        const busy = events();
        const held = openSocket(`ws://localhost:${port}/v1/connect`, CONTROL_KEY, busy);
        held.ref();
        await busy.opened;
        await vi.waitFor(() => expect(server?.connections()).toHaveLength(2));
        expect(liveSockets()).toBe(before + 3);

        unheld.close();
        held.close();
        await Promise.all([idle.closed, busy.closed]);
    });

    it("takes messages from control larger than 1 MB", async () => {
        server = await startControlServer();
        const seen = events();
        openSocket(socketUrl(server.url), CONTROL_KEY, seen);
        await seen.opened;
        await vi.waitFor(() => expect(server?.connections()).toHaveLength(1));

        server.connections()[0]?.send("x".repeat(2 * 1024 * 1024));
        await vi.waitFor(() => expect(seen.message).toHaveBeenCalled());

        expect(String(vi.mocked(seen.message).mock.calls[0]?.[0])).toHaveLength(2 * 1024 * 1024);
    });

    it("opens TLS for wss, with the host name as the server name", async () => {
        const { port, received } = await firstBytes();
        const seen = events();

        openSocket(`wss://localhost:${port}/v1/connect`, CONTROL_KEY, seen);
        const hello = await received;

        // A TLS handshake record, naming the host
        expect(hello[0]).toBe(0x16);
        expect(hello.includes("localhost")).toBe(true);
        expect((await seen.closed)[1]).toBe(false);
    });
});

describe("rawSocket", () => {
    it("names no server for an IP address, and keeps a server name it is given", async () => {
        const byIp = await firstBytes();
        const ip = rawSocket(true, { host: "127.0.0.1", port: byIp.port });
        const withIp = await byIp.received;
        ip.destroy();
        await new Promise((resolve) => tcp?.close(resolve));

        const named = await firstBytes();
        const socket = rawSocket(true, { port: named.port, servername: "control.acme.test" });
        const withName = await named.received;
        socket.destroy();

        expect(withIp.includes("127.0.0.1")).toBe(false);
        expect(withName.includes("control.acme.test")).toBe(true);
    });

    it("names no server when it has no host", async () => {
        const { port, received } = await firstBytes();

        const socket = rawSocket(true, { port });
        const hello = await received;
        socket.destroy();

        expect(hello[0]).toBe(0x16);
    });
});
