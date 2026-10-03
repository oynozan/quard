import { afterEach, describe, expect, it, vi } from "vitest";
import { parseN } from "../test/files.ts";
import { urlSource } from "./url-source.ts";

const FEED_URL = "https://feeds.example.com/feed.json";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

// Stubs fetch with answers given in order
function answers(...replies: Array<Response | Error>) {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
        const reply = replies.shift();
        if (reply instanceof Error) {
            throw reply;
        }
        return reply as Response;
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("urlSource", () => {
    it("downloads at once, then sends the ETag and keeps the value on 304", async () => {
        const fetch = answers(
            new Response('{"n":1}', { headers: { etag: '"v1"' } }),
            new Response(null, { status: 304 }),
        );
        const source = urlSource(FEED_URL, parseN, () => undefined, 60_000);
        expect(source.current()).toBeUndefined();

        await source.ready;
        await source.pull();
        source.refresh(Date.now());
        source.close();

        expect(source.current()).toBe(1);
        expect(fetch.mock.calls.map(([, init]) => init.headers)).toEqual([{}, { "if-none-match": '"v1"' }]);
    });

    it("reports failed and invalid downloads and keeps the last good value", async () => {
        answers(
            new Response('{"n":1}'),
            new Response("down", { status: 503 }),
            new Response('{"n":"x"}'),
            new Error("offline"),
        );
        const errors: string[] = [];
        const source = urlSource(FEED_URL, parseN, (message) => errors.push(message), 60_000);

        await source.ready;
        await source.pull();
        await source.pull();
        await source.pull();
        source.close();

        expect(source.current()).toBe(1);
        expect(errors).toEqual([`${FEED_URL}: HTTP 503`, `${FEED_URL}: n must be a number`, `${FEED_URL}: offline`]);
    });

    it("polls on its interval until it is closed", async () => {
        vi.useFakeTimers();
        const fetch = answers(new Response('{"n":1}'), new Response('{"n":2}'));
        const source = urlSource(FEED_URL, parseN, () => undefined, 1000);

        await source.ready;
        await vi.advanceTimersByTimeAsync(1000);
        expect(source.current()).toBe(2);
        source.close();
        await vi.advanceTimersByTimeAsync(5000);

        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
