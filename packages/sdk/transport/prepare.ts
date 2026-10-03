import { extractValues, redactEvent, type Redactor, type RunEvent } from "@quard/shared";
import { textOf } from "../labels/text-of.ts";

// What leaves the process. Tool calls first gain the value keys of their
// arguments, so search can still find them, then everything is redacted.
export function prepareEvent(event: RunEvent, redactor: Redactor): RunEvent {
    if (event.type !== "tool_call") {
        return redactEvent(redactor, event);
    }
    const keys = [...new Set(extractValues(textOf(event.arguments)).flatMap((value) => value.keys))];
    return redactEvent(redactor, { ...event, keys });
}
