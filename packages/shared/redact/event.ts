import type { RunEvent } from "../events/schema.ts";
import type { Redactor } from "./redactor.ts";

// What leaves the process: every string redacted, value keys hashed
export function redactEvent(redactor: Redactor, event: RunEvent): RunEvent {
    const clean = redactor.value(event) as RunEvent;
    const keys = event.type === "content" || event.type === "tool_call" ? event.keys : undefined;
    return keys === undefined ? clean : ({ ...clean, keys: keys.map(redactor.key) } as RunEvent);
}
