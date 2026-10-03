import type { RunEvent } from "quard";

export function title(text: string): void {
    console.log(`\n${text}`);
}

// Prints one line per event. Quiet decisions (allow, pass) are skipped.
export function printEvent(event: RunEvent): void {
    const line = describe(event);
    if (line !== undefined) {
        console.log(`    · ${line}`);
    }
}

function describe(event: RunEvent): string | undefined {
    switch (event.type) {
        case "run_started":
            return `${event.agent} started a run`;
        case "content": {
            const flags = event.flags.length > 0 ? `, flagged: ${event.flags.join(", ")}` : "";
            return `labeled ${event.origin}: ${event.trust}, ${event.sensitivity}${flags}`;
        }
        case "model_call": {
            const names = event.toolCalls.map((call) => call.name);
            return names.length > 0 ? `model asked for ${names.join(", ")}` : "model replied";
        }
        case "tool_call": {
            const influenced = event.influenced ? " (after reading untrusted content)" : "";
            return `${event.tool} ${event.status === "ok" ? "ran" : event.status}${influenced}`;
        }
        case "decision": {
            if (event.decision === "allow" || event.decision === "pass") {
                return undefined;
            }
            const why = event.reason === undefined ? "" : ` (${event.reason.replaceAll(",", ", ")})`;
            return event.enforced
                ? `${event.guard} guard: ${event.decision}${why}`
                : `${event.guard} guard would ${event.decision}${why}, but only observes`;
        }
        case "warning":
            return `warning: ${event.code}${event.tool === undefined ? "" : ` (${event.tool})`}`;
    }
}
