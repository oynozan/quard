import type { RunEvent } from "@quard/shared";
import { getConfig } from "./config.ts";

// Matches the backend-down buffer size in PROJECT.md
const MAX_BUFFERED = 10_000;
const buffer: RunEvent[] = [];

export function record(event: RunEvent): void {
    if (buffer.length >= MAX_BUFFERED) {
        buffer.shift();
    }
    buffer.push(event);
    try {
        getConfig().onEvent?.(event);
    } catch {
        // A broken event sink must never change what a guarded call does
    }
}

// Hands over the buffered events. M2 sends them to webhook.
export function takeEvents(): RunEvent[] {
    return buffer.splice(0, buffer.length);
}

export function now(): string {
    return new Date().toISOString();
}
