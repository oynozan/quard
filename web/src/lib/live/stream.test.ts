// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Subscriber } from "./hub";
import { PING_MS, QUEUE_MAX, liveStream } from "./stream";

let subscriber: Subscriber;
const unsubscribe = vi.fn();
const hub = {
    subscribe: vi.fn((next: Subscriber) => {
        subscriber = next;
        return unsubscribe;
    }),
};
const decoder = new TextDecoder();

async function next(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const { value, done } = await reader.read();
    return done ? null : decoder.decode(value);
}

// Every event left in the stream, until it closes
async function rest(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const events: string[] = [];
    for (let event = await next(reader); event !== null; event = await next(reader)) events.push(event);
    return events;
}

beforeEach(() => {
    vi.useFakeTimers();
    unsubscribe.mockClear();
    hub.subscribe.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("liveStream", () => {
    it("says ready once the hub hears, then forwards changes and pings", async () => {
        const reader = liveStream("p1", new AbortController().signal, hub).getReader();

        expect(await next(reader)).toBe("retry: 2000\n\n");
        expect(subscriber.project).toBe("p1");
        subscriber.ready();
        expect(await next(reader)).toBe("event: ready\ndata: {}\n\n");
        subscriber.send({ topic: "approvals" });
        expect(await next(reader)).toBe('event: change\ndata: {"topic":"approvals"}\n\n');
        vi.advanceTimersByTime(PING_MS);
        expect(await next(reader)).toBe(": ping\n\n");
        await reader.cancel();
    });

    it("ends when the hub loses its listener", async () => {
        const reader = liveStream("p1", new AbortController().signal, hub).getReader();
        subscriber.ready();
        subscriber.end();

        expect(await rest(reader)).toEqual(["retry: 2000\n\n", "event: ready\ndata: {}\n\n"]);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        subscriber.send({ topic: "fleet" });
        subscriber.end();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("ends after the first change while no project exists, so it reopens scoped", async () => {
        const reader = liveStream(undefined, new AbortController().signal, hub).getReader();
        subscriber.send({ topic: "fleet" });

        expect(await rest(reader)).toEqual(["retry: 2000\n\n", 'event: change\ndata: {"topic":"fleet"}\n\n']);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("ends instead of queueing for a reader that stopped reading", async () => {
        const reader = liveStream("p1", new AbortController().signal, hub).getReader();
        for (let n = 0; n < QUEUE_MAX + 5; n++) subscriber.send({ topic: "runs" });

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(await rest(reader)).toHaveLength(QUEUE_MAX);
    });

    it("stops and closes when the request aborts", async () => {
        const abort = new AbortController();
        const reader = liveStream(undefined, abort.signal, hub).getReader();
        await next(reader);

        abort.abort();
        expect(await next(reader)).toBeNull();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(PING_MS * 2);
        await reader.cancel();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("stops when the reader cancels, and ignores a later abort", async () => {
        const abort = new AbortController();
        const reader = liveStream("p1", abort.signal, hub).getReader();
        await reader.cancel();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        abort.abort();
        vi.advanceTimersByTime(PING_MS * 2);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("closes at once for a request that already aborted", async () => {
        const reader = liveStream("p1", AbortSignal.abort(), hub).getReader();

        expect(await next(reader)).toBe("retry: 2000\n\n");
        expect(await next(reader)).toBeNull();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
