import type { Change } from "./change";

// Server-Sent Events text. Every event ends with a blank line.
export const RETRY = "retry: 2000\n\n";
export const READY = "event: ready\ndata: {}\n\n";
export const PING = ": ping\n\n";

export const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
};

const encoder = new TextEncoder();

export function changeEvent(change: Change): string {
    return `event: change\ndata: ${JSON.stringify(change)}\n\n`;
}

export function encode(text: string): Uint8Array {
    return encoder.encode(text);
}
