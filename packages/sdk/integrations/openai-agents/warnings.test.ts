import { tool } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { quard } from "../../index.ts";
import { scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function unwrapped(): string[] {
    return events.flatMap((event) =>
        event.type === "warning" && event.code === "unwrapped_tool" ? [String(event.tool)] : [],
    );
}

describe("unwrapped tool warnings in an Agents SDK run", () => {
    it("leave out the SDK's own handoff and agent tools, and keep app tools", async () => {
        const lookUp = tool({
            name: "lookUp",
            description: "Look up a supplier",
            parameters: z.object({}),
            execute: async () => "Acme",
        });
        const billing = testAgent("billing", { tools: [lookUp] });
        const researcher = testAgent("researcher");
        const orchestrator = testAgent("orchestrator", {
            tools: [researcher.asTool({ toolName: "research", toolDescription: "Read a page" })],
            handoffs: [billing],
        });
        const { client } = scriptedClient({
            orchestrator: [
                { calls: [{ name: "research", args: { input: "Read invoice 114." } }] },
                { calls: [{ name: "transfer_to_billing", args: {} }] },
            ],
            researcher: [{ text: "Invoice 114 is due." }],
            billing: [{ calls: [{ name: "lookUp", args: {} }] }, { text: "Paid." }],
        });

        await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        expect(unwrapped()).toEqual(["lookUp"]);
    });
});
