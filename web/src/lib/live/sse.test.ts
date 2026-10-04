// @vitest-environment node
import { describe, expect, it } from "vitest";
import { changeEvent, encode, PING, READY, RETRY, SSE_HEADERS } from "./sse";

describe("sse", () => {
    it("writes the fixed lines", () => {
        expect(RETRY).toBe("retry: 2000\n\n");
        expect(READY).toBe("event: ready\ndata: {}\n\n");
        expect(PING).toBe(": ping\n\n");
    });

    it("writes a change event as one JSON data line", () => {
        expect(changeEvent({ topic: "runs", runs: ["a"] })).toBe(
            'event: change\ndata: {"topic":"runs","runs":["a"]}\n\n',
        );
    });

    it("encodes text as UTF-8 bytes", () => {
        expect(new TextDecoder().decode(encode(PING))).toBe(PING);
    });

    it("asks proxies not to buffer or cache", () => {
        expect(SSE_HEADERS).toEqual({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
    });
});
