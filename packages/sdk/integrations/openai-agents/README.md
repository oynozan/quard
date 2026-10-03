# Quard for the OpenAI Agents SDK

Import it from `quard/openai-agents`. It needs `@openai/agents` 0.18.

```ts
import OpenAI from "openai";
import { Agent } from "@openai/agents";
import { z } from "zod";
import { guardedTool, quardRunner } from "quard/openai-agents";

const fetchPage = guardedTool({
    name: "fetchPage",
    description: "Fetch a web page",
    parameters: z.object({ url: z.string() }),
    execute: async ({ url }) => (await fetch(url)).text(),
    guard: { type: "source", origin: "web" },
});

const payInvoice = guardedTool({
    name: "payInvoice",
    description: "Pay a supplier invoice",
    parameters: z.object({ iban: z.string(), amount: z.number() }),
    execute: async ({ iban, amount }) => pay(iban, amount),
    guard: { type: "action", rules: [{ field: "iban", from: ["tool:getSupplier"] }] },
});

const billing = new Agent({ name: "billing", instructions: "Pay invoices.", tools: [payInvoice] });
const researcher = new Agent({ name: "researcher", instructions: "Read pages.", tools: [fetchPage] });
const orchestrator = new Agent({
    name: "orchestrator",
    instructions: "Plan the work.",
    tools: [researcher.asTool({ toolName: "research", toolDescription: "Read a web page" })],
    handoffs: [billing],
});

const runner = quardRunner({ client: new OpenAI() });
const result = await runner.run(orchestrator, "Pay invoice 114 from Acme Supplies.");
```

Set up Quard with `quard.configure()` as usual.

## quardRunner(options)

Returns an SDK `Runner`. It takes the SDK's run config, plus `client`: an OpenAI client. The client is wrapped with `quard.wrap()` unless it already is.

- Model calls use the Responses API over HTTP, so the monitor sees each one.
- Each `run()` lands in one Quard run: the run of the current `quard.run()` scope, or a new run named after the first agent.
- The agent comes from the framework. A handoff switches it. An agent run as a tool, with `agent.asTool()`, runs under its own name.
- Model calls and guarded tools carry that agent. The new agent's parent step is the step that handed over.
- Each switch is recorded as a `handoff` event: from, to, `via: "handoff"` or `"tool"`, and the run's context label.
- A resumed run, from `result.state`, goes on with the agent it stopped at.

## guardedTool(options)

Takes the SDK's `tool()` options, plus `guard`: the options of one guard or a list. Each guard takes the tool's name.

- Every call runs through `guard()`. Only the input is checked. `execute` still gets the run context and the call details.
- A block becomes a tool guardrail rejection from the `quard` guardrail. The model reads Quard's refusal text as the tool result, and `result.toolOutputGuardrailResults` holds the refusal.
- With `onBlock: "throw"`, the run stops and `run()` rejects with `GuardBlockedError`. Its `cause` is the SDK's `ToolCallError`.
- An approval guard waits inside the call for the answer from the dashboard, as anywhere else. The SDK's own `needsApproval` still works beside it.

## Limits

- To follow agents run as tools, the first `quardRunner()` call wraps `Runner.prototype.run`. A runner that does not use a `quardRunner()` provider runs as before. So do runs started with the SDK's `run()`, and agent tools with their own `runConfig.modelProvider`.
- An agent whose `model` is a `Model` object, not a name, skips the wrapped client. Its model calls are not recorded, but its guarded tools still carry the right agent.
- Inside an agent run as a tool, `onBlock: "throw"` stops that agent's run. The calling agent reads the error as the tool result.
- The monitor still warns `unwrapped_tool` for handoff and agent tool calls.
