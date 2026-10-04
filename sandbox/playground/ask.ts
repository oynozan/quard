import { createInterface } from "node:readline";
import type { Scenario, ToolName } from "./scenario.ts";

type Terminal = { input: NodeJS.ReadableStream & { isTTY?: boolean }; output: NodeJS.WritableStream };

// What each tool lets the agent do, in the story
const CAN: Record<ToolName, string> = {
    readEmail: "read the newest email in the finance inbox",
    fetchPage: "open any web page",
    getSupplier: "look up a supplier and its bank details in Acme's records",
    getCustomers: "read Acme's customer list",
    payInvoice: "pay an invoice by bank transfer",
    sendEmail: "send an email to anyone",
};

// The story shown before the question, with the tools the scenario gives the agent
export function story(tools: readonly ToolName[]): string {
    return [
        "",
        "Acme Ltd, Monday, 8:55.",
        "",
        "Acme's finance team has a new AI agent. It started this morning and it",
        "already has the keys to the bank account and the mailbox. It can:",
        "",
        ...tools.map((tool) => `  - ${CAN[tool]}`),
        "",
        "Quard sits between the agent and every one of those tools. It sees",
        "where each piece of text came from and checks each call before it runs.",
        "",
        "You are on the finance team. Tell the agent what to do.",
        "",
    ].join("\n");
}

// Tells the story and asks what the agent should do. Without a terminal, as in
// tests and scripts, it uses the prompt in scenario.json. Undefined when the
// person closes the terminal (Ctrl+C) before answering.
export function askPrompt(
    scenario: Scenario,
    { input, output }: Terminal = { input: process.stdin, output: process.stdout },
): Promise<string | undefined> {
    if (!input.isTTY) {
        return Promise.resolve(scenario.prompt);
    }
    output.write(`${story(scenario.tools)}\n`);
    const terminal = createInterface({ input, output, prompt: "> " });
    return new Promise((resolve) => {
        terminal.on("line", (line) => {
            const typed = line.trim();
            if (typed === "") {
                terminal.prompt();
                return;
            }
            resolve(typed);
            terminal.close();
        });
        // Once answered, this changes nothing
        terminal.on("close", () => resolve(undefined));
        terminal.prompt();
    });
}
