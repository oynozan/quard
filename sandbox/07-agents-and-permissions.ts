// 07 · Agents and permissions
//
// quard.run() starts a run for one agent. quard.agent() starts a
// sub-agent inside that run. Both can take the list of tools the agent
// may use. A sub-agent can only narrow its parent's list, never widen it.
//
// Run: node sandbox/07-agents-and-permissions.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

const lookupOrder = guard(async (input: { orderId: string }) => `order ${input.orderId}: 2 mugs, shipped`, {
    type: "limit",
    name: "lookupOrder",
    maxCallsPerRun: 20,
});

const refundOrder = guard(async (input: { orderId: string }) => `refunded order ${input.orderId}`, {
    type: "limit",
    name: "refundOrder",
    maxCallsPerRun: 3,
});

// The model is offered both tools every time; Quard enforces the lists
const tools = { lookupOrder, refundOrder };

await quard.run({ agent: "support" }, async () => {
    title("The support agent may use every tool");
    await runAgent(client, "Refund order 1001.", tools);

    title("Its FAQ bot may only look up orders");
    await quard.agent("faq-bot", () => runAgent(client, "Refund order 1002.", tools), { tools: ["lookupOrder"] });
});

title("A sub-agent can't get a tool its parent doesn't have");
await quard.run({ agent: "intern", tools: ["lookupOrder"] }, async () => {
    // Asks for refundOrder, but the intern can't pass it on
    await quard.agent("helper", () => runAgent(client, "Refund order 1003.", tools), {
        tools: ["lookupOrder", "refundOrder"],
    });
});
