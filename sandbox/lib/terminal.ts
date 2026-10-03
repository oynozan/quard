import { createInterface, type Interface } from "node:readline";
import type { ApprovalAnswer, ApprovalRequest } from "quard";

// Lines typed in the terminal, kept in order even when piped in.
// When input ends, every open question gets an empty answer.
let terminal: Interface | undefined;
let ended = false;
const typed: string[] = [];
const waiting: Array<(line: string) => void> = [];

function nextLine(): Promise<string> {
    if (terminal === undefined) {
        terminal = createInterface({ input: process.stdin });
        terminal.on("line", (line) => {
            const answer = waiting.shift();
            if (answer === undefined) {
                typed.push(line);
            } else {
                answer(line);
            }
        });
        terminal.on("close", () => {
            ended = true;
            waiting.splice(0).forEach((answer) => answer(""));
        });
    }
    const line = typed.shift();
    if (line !== undefined || ended) {
        return Promise.resolve(line ?? "");
    }
    return new Promise((resolve) => waiting.push(resolve));
}

// An approver for quard.configure(). Anything but once or always denies.
export async function askInTerminal(request: ApprovalRequest): Promise<ApprovalAnswer> {
    process.stdout.write(`    ? Approve ${request.tool} ${JSON.stringify(request.input)}? [o]nce, [a]lways, [d]eny: `);
    const answer = (await nextLine()).trim().toLowerCase();
    if (!process.stdin.isTTY) {
        console.log(answer);
    }
    if (answer.startsWith("a")) {
        return "always";
    }
    return answer.startsWith("o") ? "once" : "deny";
}

// Lets the process exit once the questions are done
export function closeTerminal(): void {
    terminal?.close();
}
