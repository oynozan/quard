import type { RunEvent } from "@quard/shared";
import { getConfig } from "./config.ts";

// Matches the backend-down buffer size in PROJECT.md
const MAX_BUFFERED = 10_000;
const buffer: RunEvent[] = [];
let dropped = 0;

function isQuiet(event: RunEvent): boolean {
    return event.type === "decision" && (event.decision === "allow" || event.decision === "pass");
}

// A full buffer drops the oldest allow decision first, then the oldest event
function makeRoom(): void {
    const quiet = buffer.findIndex(isQuiet);
    buffer.splice(Math.max(quiet, 0), 1);
    dropped += 1;
}

export function record(event: RunEvent): void {
    if (buffer.length >= MAX_BUFFERED) {
        makeRoom();
    }
    buffer.push(event);
    try {
        getConfig().onEvent?.(event);
    } catch {
        // A broken event sink must never change what a guarded call does
    }
}

// Hands over the oldest buffered events, all of them by default
export function takeEvents(max = buffer.length): RunEvent[] {
    return buffer.splice(0, max);
}

// How many events a full buffer dropped since the last call
export function takeDropped(): number {
    const count = dropped;
    dropped = 0;
    return count;
}

export function now(): string {
    return new Date().toISOString();
}
