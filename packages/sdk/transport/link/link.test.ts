import type { ClientMessage, ServerMessage } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetProjectKey, projectKey } from "../../core/project-key.ts";
import { fakeLink, fakeSockets, HELLO, READY, sentOf } from "../../test/fake-socket.ts";
import { PROJECT_KEY } from "../../test/hash-key.ts";
import { createLink, LINK_TIMING, MAX_MESSAGE } from "./link.ts";

const BEAT: ClientMessage = { type: "beat", askIds: ["c".repeat(16)] };
const QUARANTINE: ServerMessage = { type: "quarantine", add: [], remove: ["domain:evil.com"] };

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    forgetProjectKey();
    vi.useRealTimers();
});

describe("the link to control", () => {
    it("opens one socket with the key, says hello and is ready once control answers", () => {
        const { fake, link } = fakeLink();
        const ready = vi.fn();
        link.listen({ ready });
        link.start();

        const socket = fake.last();
        expect(fake.sockets).toHaveLength(1);
        expect([socket.url, socket.key, socket.held]).toEqual(["ws://control.test/v1/connect", "qk_live_test", false]);
        socket.accept();
        expect(socket.sent).toEqual([HELLO]);
        expect(link.ready()).toBe(false);

        socket.reply(READY);

        expect(link.ready()).toBe(true);
        expect(ready).toHaveBeenCalledWith(READY);
    });

    it("learns the project's hash key from ready before its listeners hear of it", () => {
        const { fake, link } = fakeLink();
        const keys: unknown[] = [];
        link.listen({ ready: () => keys.push(projectKey()) });

        fake.connect();

        expect(keys).toEqual([PROJECT_KEY]);
    });

    it("ignores messages before ready, messages it can't read and a second ready", () => {
        const { fake, link } = fakeLink();
        const listener = { ready: vi.fn(), message: vi.fn() };
        link.listen(listener);
        const socket = fake.last();
        socket.accept();

        socket.reply({ type: "error", code: "hello_expected", message: "say hello first" });
        socket.reply("not json");
        socket.reply(JSON.stringify({ type: "nope" }));
        expect(link.ready()).toBe(false);

        socket.reply(READY);
        socket.reply(READY);
        socket.reply("{ broken");
        socket.reply(QUARANTINE);

        expect(listener.ready).toHaveBeenCalledTimes(1);
        expect(listener.message.mock.calls).toEqual([[QUARANTINE]]);
    });

    it("sends only while ready, and never a message that is too big or can't go out", () => {
        const { fake, link } = fakeLink();
        expect(link.send(BEAT)).toBe(false);
        const socket = fake.connect();

        expect(link.send(BEAT)).toBe(true);
        const huge: ClientMessage = { type: "agent", agent: "a", version: "f".repeat(16), model: "m", tools: [] };
        expect(link.send({ ...huge, instructions: "x".repeat(MAX_MESSAGE) })).toBe(false);
        socket.closed = true;
        expect(link.send(BEAT)).toBe(false);
        expect(sentOf(socket, "beat")).toEqual([BEAT]);
    });

    it("reconnects after a drop, waiting 1 s and doubling up to 15 s", () => {
        const { fake, link } = fakeLink();
        const down = vi.fn();
        link.listen({ down });
        fake.connect().drop();

        expect(down).toHaveBeenCalledTimes(1);
        expect(link.ready()).toBe(false);
        const waits: number[] = [];
        for (let attempt = 0; attempt < 6; attempt++) {
            const opened = fake.sockets.length;
            let waited = 0;
            while (fake.sockets.length === opened) {
                vi.advanceTimersByTime(1000);
                waited += 1000;
            }
            waits.push(waited);
            fake.last().drop();
        }

        expect(waits).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
        expect(down).toHaveBeenCalledTimes(1);
    });

    it("waits 1 s again after a connection that worked", () => {
        const { fake } = fakeLink();
        fake.last().drop();
        vi.advanceTimersByTime(1000);
        fake.last().drop();
        vi.advanceTimersByTime(2000);
        fake.connect().drop();

        vi.advanceTimersByTime(999);
        expect(fake.sockets).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(fake.sockets).toHaveLength(4);
    });

    it("warns once when control refuses the key, and keeps trying", () => {
        const warn = vi.fn();
        const { fake } = fakeLink({}, warn);

        fake.last().drop(1006, true);
        vi.advanceTimersByTime(1000);
        fake.last().accept();
        fake.last().drop(4401);
        vi.advanceTimersByTime(2000);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("control refused the agent key"));
        expect(fake.sockets).toHaveLength(3);
    });

    it("drops a connection that never says ready", () => {
        const { fake } = fakeLink();
        fake.last().accept();

        vi.advanceTimersByTime(LINK_TIMING.readyMs);

        expect(fake.last().closed).toBe(true);
        vi.advanceTimersByTime(1000);
        expect(fake.sockets).toHaveLength(2);
    });

    it("drops a ready connection once control goes silent", () => {
        const { fake } = fakeLink();
        const socket = fake.connect();

        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(30_000);
            socket.ping();
        }
        vi.advanceTimersByTime(60_000);
        socket.reply(QUARANTINE);
        vi.advanceTimersByTime(60_000);
        expect(socket.closed).toBe(false);

        vi.advanceTimersByTime(LINK_TIMING.silentMs - 60_000);
        expect(socket.closed).toBe(true);
    });

    it("keeps the process alive only while something holds the link", () => {
        const timers = vi.spyOn(globalThis, "setTimeout");
        const { fake, link } = fakeLink();
        const socket = fake.connect();

        const first = link.hold();
        const second = link.hold();
        expect(socket.held).toBe(true);
        first();
        first();
        expect(socket.held).toBe(true);
        second();
        expect(socket.held).toBe(false);

        const release = link.hold();
        socket.drop();
        const retry = timers.mock.results.at(-1)?.value as NodeJS.Timeout;
        expect(retry.hasRef()).toBe(true);
        release();
        expect(retry.hasRef()).toBe(false);
        link.hold();
        vi.advanceTimersByTime(1000);
        expect(fake.last().held).toBe(true);
    });

    it("stops for good, and can start again", () => {
        const { fake, link } = fakeLink();
        const down = vi.fn();
        link.listen({ down });
        const socket = fake.connect();

        link.stop();
        vi.advanceTimersByTime(60_000);

        expect(socket.closed).toBe(true);
        expect(down).not.toHaveBeenCalled();
        expect(fake.sockets).toHaveLength(1);
        link.start();
        fake.last().drop();
        link.stop();
        vi.advanceTimersByTime(60_000);
        expect(fake.sockets).toHaveLength(2);
    });

    it("ignores a socket it already left behind", () => {
        const { fake, link } = fakeLink();
        const ready = vi.fn();
        link.listen({ ready });
        const old = fake.last();
        old.drop();
        vi.advanceTimersByTime(1000);

        old.accept();
        old.reply(READY);
        old.ping();

        expect(ready).not.toHaveBeenCalled();
        expect(old.sent).toEqual([]);
    });

    it("tries again later when a socket can't be opened", () => {
        const fake = fakeSockets();
        const link = createLink({ url: "ws://control.test", key: "k", hello: () => HELLO, open: fake.open });
        fake.failNextOpen();

        link.start();
        expect(fake.sockets).toHaveLength(0);
        vi.advanceTimersByTime(1000);

        expect(fake.sockets).toHaveLength(1);
    });

    it("keeps telling the other listeners when one of them throws", () => {
        const { fake, link } = fakeLink();
        const ready = vi.fn();
        link.listen({
            ready: () => {
                throw new Error("broken listener");
            },
        });
        link.listen({ ready });

        fake.connect();

        expect(ready).toHaveBeenCalledTimes(1);
    });

    it("warns on the console by default", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fake = fakeSockets();
        createLink({ url: "ws://control.test", key: "k", hello: () => HELLO, open: fake.open }).start();

        fake.last().drop(4401);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining("control refused the agent key"));
        warn.mockRestore();
    });
});
