import { RunContext } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerCall } from "../../context/registry.ts";
import { currentScope } from "../../context/scope.ts";
import { quard } from "../../index.ts";
import { unguardedOutputLabel } from "../../monitor/framework-tools.ts";
import { scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { followHandoffs } from "./handoffs.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function agents() {
    const getOrder = guardedTool({
        name: "getOrder",
        description: "Look up an order",
        parameters: z.object({ order: z.string() }),
        execute: async () => "Order 114 for Acme Supplies, 4950 EUR",
        guard: { type: "limit", maxCallsPerRun: 5 },
    });
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay an invoice",
        parameters: z.object({ order: z.string() }),
        execute: async () => "paid",
        guard: { type: "limit", maxCallsPerRun: 5 },
    });
    const billing = testAgent("billing", { tools: [payInvoice] });
    const orchestrator = testAgent("orchestrator", { tools: [getOrder], handoffs: [billing] });
    return { orchestrator, billing };
}

function toolCalls() {
    return events.flatMap((event) => (event.type === "tool_call" ? [[event.tool, event.influenced]] : []));
}

describe("a handoff's tool output", () => {
    it("reads as system content, so the receiving agent is not influenced by it", async () => {
        const { client } = scriptedClient({
            orchestrator: [
                { calls: [{ name: "getOrder", args: { order: "114" } }] },
                { calls: [{ name: "transfer_to_billing", args: {} }] },
            ],
            billing: [{ calls: [{ name: "payInvoice", args: { order: "114" } }] }, { text: "Paid." }],
        });

        await quardRunner({ client }).run(agents().orchestrator, "Pay invoice 114.");

        expect(toolCalls()).toEqual([
            ["getOrder", false],
            ["payInvoice", false],
        ]);
        const content = events.flatMap((event) =>
            event.type === "content" ? [[event.agent, event.origin, event.trust]] : [],
        );
        // Each agent's instructions, then billing reads the handoff's output
        expect(content).toEqual([
            ["orchestrator", "system", "trusted"],
            ["orchestrator", "user", "trusted"],
            ["orchestrator", "tool:getOrder", "trusted"],
            ["billing", "system", "trusted"],
            ["billing", "system", "trusted"],
            ["billing", "tool:payInvoice", "trusted"],
        ]);
    });

    it("is marked only for handoffs offered inside a Quard run", async () => {
        followHandoffs();
        followHandoffs();
        const { orchestrator } = agents();

        const outside = await orchestrator.getEnabledHandoffs(new RunContext());
        const label = await quard.run({}, async () => {
            await orchestrator.getEnabledHandoffs(new RunContext());
            const scope = currentScope()!;
            const call = registerCall({ callId: "c1", tool: "transfer_to_billing", args: {}, scope, stepId: "s1" });
            return unguardedOutputLabel(call, {});
        });

        expect(outside.map((handoff) => handoff.toolName)).toEqual(["transfer_to_billing"]);
        expect(label.origin).toBe("system");
    });
});
