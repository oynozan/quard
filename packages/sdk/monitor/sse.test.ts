import { describe, expect, it } from "vitest";
import { parseSseEvent, tapSse, type SseEvent } from "./sse.ts";

function streamOf(text: string, size: number): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new ReadableStream({
        pull(controller) {
            if (offset >= bytes.length) {
                controller.close();
                return;
            }
            controller.enqueue(bytes.slice(offset, offset + size));
            offset += size;
        },
    });
}

describe("parseSseEvent", () => {
    it("reads the event name and joins data lines", () => {
        expect(parseSseEvent(": comment\r\nevent: done\r\ndata: one\r\ndata:two\r\n\r\n")).toEqual({
            event: "done",
            data: "one\ntwo",
        });
        expect(parseSseEvent("data: x")).toEqual({ event: undefined, data: "x" });
    });
});

describe("tapSse", () => {
    it("passes the stream through unchanged and shows every event to the hook", async () => {
        const text = 'event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\ndata: tail';
        const seen: SseEvent[] = [];

        const out = await new Response(tapSse(streamOf(text, 5), (event) => void seen.push(event))).text();

        expect(out).toBe(text);
        expect(seen.map((event) => event.data)).toEqual(['{"n":1}', '{"n":2}', "tail"]);
    });

    it("waits for the hook before passing an event on", async () => {
        const order: string[] = [];
        const tapped = tapSse(streamOf("data: 1\n\n", 64), async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push("checked");
        });
        const reader = tapped.getReader();

        await reader.read();
        order.push("received");

        expect(order).toEqual(["checked", "received"]);
    });
});
