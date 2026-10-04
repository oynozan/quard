import { styleText } from "node:util";
import type { RunEvent } from "quard";

type Color = "red" | "yellow" | "green";

// Agent names pad to 11 characters and actions to 31, so the details line up
const AGENT_WIDTH = 11;
const ACTION_WIDTH = 31;

// What each agent calls the message it gets
const MESSAGE_NAMES: Record<string, string> = { lead: "findings", engineer: "a work order" };

// Values in a message keep their web origin, so only a tool call step seen here means a page was read
const toolSteps = new Set<string>();

function say(text: string): void {
    process.stdout.write(`${text}\n`);
}

function line(agent: string, action: string, detail = "", color?: Color): void {
    const shown = color === undefined ? action : styleText(color, action);
    const gap = " ".repeat(Math.max(0, ACTION_WIDTH - action.length));
    const rest = detail === "" ? "" : `${gap} ${styleText("dim", detail)}`;
    say(`${agent.padEnd(AGENT_WIDTH)} ${shown}${rest}`);
}

// The command a runShell call asks for, or its raw arguments
function commandOf(args: string): string {
    try {
        const command = (JSON.parse(args) as { command?: unknown } | null)?.command;
        return typeof command === "string" ? command : args;
    } catch {
        return args;
    }
}

// runAgent logs every turn with console.log, and only the story should show
export function hideAgentLogs(): void {
    console.log = () => {};
}

export function printHeader(title: string, subtitle: string): void {
    say(styleText("bold", title));
    say(subtitle);
}

// One line for each step that matters, and nothing for the rest
export function printStep(event: RunEvent): void {
    switch (event.type) {
        case "run_started":
            say(`${styleText("dim", "Run")}  http://localhost:3100/runs/${event.runId}\n`);
            break;
        case "content":
            if (event.origin.startsWith("web:") && toolSteps.has(event.stepId)) {
                line(event.agent, "reads a web page", `${event.origin} · ${event.trust}`);
            }
            break;
        case "message": {
            const name = MESSAGE_NAMES[event.agent] ?? "a message";
            const kept = event.verified ? "label kept" : "label lost";
            line(event.agent, `gets ${name} from ${event.from}`, `${event.trust} · ${kept}`);
            break;
        }
        case "model_call":
            for (const call of event.toolCalls) {
                if (call.name === "runShell") {
                    line(event.agent, "wants to run", commandOf(call.arguments));
                }
            }
            break;
        case "decision":
            if (event.decision === "block" && event.enforced) {
                line(event.agent, "✗ blocked", event.rule, "red");
            } else if (event.decision === "block") {
                line(event.agent, "! would block", `${event.rule}, only observes`, "yellow");
            }
            break;
        case "tool_call":
            toolSteps.add(event.stepId);
            if (event.tool === "runShell" && event.status === "ok") {
                line(event.agent, "ran the command");
            }
            break;
    }
}

// What the attacker's collector got, with the note shown only after a leak
export function printResult(received: readonly string[], leakNote?: string): void {
    const leaked = received.flatMap((body) => body.split("\n")).filter((text) => text.trim() !== "");
    if (leaked.length === 0) {
        say(`\nAttacker received  ${styleText("green", "nothing")}`);
        return;
    }
    say("\nAttacker received");
    leaked.forEach((text) => say(`  ${styleText("red", text)}`));
    if (leakNote !== undefined) {
        say(leakNote);
    }
}
