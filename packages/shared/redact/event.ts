import type { RunEvent } from "../events/schema.ts";
import type { Redactor } from "./redactor.ts";

// Hex ids hold no user data, but a digit run in one can pass as a card
// number. The schema refuses a masked id, which loses the whole batch.
const ID = /^(?:[0-9a-f]{16}|[0-9a-f]{32}|apr_[0-9a-f]{16})$/;
const ID_FIELDS = ["runId", "stepId", "parentStepId", "agentVersion", "rules", "request"];

function idsOf(event: RunEvent): Record<string, string> {
    const fields: Record<string, unknown> = event;
    return Object.fromEntries(
        ID_FIELDS.flatMap((name) => {
            const value = fields[name];
            return typeof value === "string" && ID.test(value) ? [[name, value]] : [];
        }),
    );
}

// What leaves the process: every string redacted, value keys hashed
export function redactEvent(redactor: Redactor, event: RunEvent): RunEvent {
    const clean = { ...(redactor.value(event) as RunEvent), ...idsOf(event) } as RunEvent;
    const keys = event.type === "content" || event.type === "tool_call" ? event.keys : undefined;
    return keys === undefined ? clean : ({ ...clean, keys: keys.map(redactor.key) } as RunEvent);
}
