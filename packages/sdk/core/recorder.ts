import type { RunEvent } from "@quard/shared";
import { getConfig } from "./config.ts";

// Matches the backend-down buffer size in PROJECT.md
const MAX_BUFFERED = 10_000;
const buffer: RunEvent[] = [];
let dropped = 0;

function isQuiet(event: RunEvent): boolean {
    return event.type === "decision" && (event.decision === "allow" || event.decision === "pass");
}

// ponytail: 32 Mi characters of request bodies and output texts held while
// the webhook is down; past it the oldest model calls lose both, and their
// replay is limited
const MAX_BODY_CHARS = 32 * 1024 * 1024;
const bodySizes = new WeakMap<RunEvent, number>();
let bodyChars = 0;

function forget(events: RunEvent[]): RunEvent[] {
    for (const event of events) {
        bodyChars -= bodySizes.get(event) ?? 0;
    }
    return events;
}

function holdBody(event: RunEvent): void {
    if (event.type !== "model_call" || (event.requestBody === undefined && event.outputText === undefined)) {
        return;
    }
    const size = JSON.stringify(event.requestBody ?? {}).length + JSON.stringify(event.outputText ?? []).length;
    bodySizes.set(event, size);
    bodyChars += size;
    for (const [i, held] of buffer.entries()) {
        if (bodyChars <= MAX_BODY_CHARS) {
            return;
        }
        const heldSize = bodySizes.get(held);
        if (held.type === "model_call" && heldSize !== undefined) {
            const { requestBody: _body, outputText: _text, ...rest } = held;
            buffer[i] = rest;
            bodyChars -= heldSize;
        }
    }
}

// A full buffer drops the oldest allow decision first, then the oldest event
function makeRoom(): void {
    const quiet = buffer.findIndex(isQuiet);
    forget(buffer.splice(Math.max(quiet, 0), 1));
    dropped += 1;
}

export function record(event: RunEvent): void {
    if (buffer.length >= MAX_BUFFERED) {
        makeRoom();
    }
    buffer.push(event);
    holdBody(event);
    try {
        getConfig().onEvent?.(event);
    } catch {
        // A broken event sink must never change what a guarded call does
    }
}

// Hands over the oldest buffered events, all of them by default
export function takeEvents(max = buffer.length): RunEvent[] {
    return forget(buffer.splice(0, max));
}

// Counts events lost after they left the buffer, reported like the ones it drops
export function addDropped(count: number): void {
    dropped += count;
}

// How many events were dropped since the last call
export function takeDropped(): number {
    const count = dropped;
    dropped = 0;
    return count;
}

export function now(): string {
    return new Date().toISOString();
}
