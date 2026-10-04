# OpenAI

How Quard works with the OpenAI Responses API through `quard.wrap()`: what it reads and changes, what passes through, how a refused model call reaches the app, hosted tools with `quard.mcpApprovals()`, and the OpenAI Agents SDK integration from `quard/openai-agents`.

Terms used here: a **run** is one task from start to finish, started by `quard.run()`. A **guarded tool** is a tool function wrapped with `guard()`, which checks each call before it runs. **Run limits** cap each run's model calls and cost. **Hosted tools** run inside OpenAI's service during the model call, not in your app.

## Contents

- [What quard.wrap() watches](#what-quardwrap-watches)
- [What passes through](#what-passes-through)
- [Tool calls the model asks for](#tool-calls-the-model-asks-for)
- [Refused model calls](#refused-model-calls)
- [Hosted tools](#hosted-tools)
- [The OpenAI Agents SDK](#the-openai-agents-sdk)
- [More](#more)

## What quard.wrap() watches

`quard.wrap(new OpenAI())` returns a copy of the client. Quard reads every `POST` to a path that ends in `/responses` made through that copy: `client.responses.create()`, streamed or not, and the `responses.parse()` and `responses.stream()` helpers built on it.

Before a request leaves, Quard:

1. Finds its run: the current `quard.run()`, else the run of the `previous_response_id`, `conversation` or tool call ids the request continues, else a run of its own.
2. Checks the run limits on steps and cost. A call over an enforced limit never leaves the process: see [Refused model calls](#refused-model-calls).
3. Labels what the model will read with an origin (where the text came from), a trust (`trusted` or `untrusted`) and a sensitivity (`internal` or `public`). The table below gives the origin and trust of each kind of text.
4. Shapes hosted tools: hosted MCP servers get `require_approval: "always"`, and web search gets its source list and allowed domains. See [Hosted tools](#hosted-tools).

| Text in the request                                               | Origin                                                                            | Trust            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| `input` text and `user` messages                                  | `user`                                                                            | trusted          |
| `instructions`, and `system` and `developer` messages             | `system`                                                                          | trusted          |
| A `function_call_output` from a guarded tool                      | the label the guard gave the result, such as `tool:getSupplier` or `web:evil.com` | from that origin |
| A `function_call_output` from any other tool                      | `unknown`                                                                         | untrusted        |
| A `previous_response_id` or `conversation` this process never saw | `unknown`                                                                         | untrusted        |

After the response, Quard checks each tool call the model asked for, adds the cost from the token usage, and records a `model_call` event with the model, the token counts, the duration, the requested tool calls and the agent version (a hash of the model, the instructions and the tool names).

- Assistant messages are the model's own words, so they get no label. Text the run already read keeps its first label, and so do the values in it.
- Never paste outside content, such as a fetched page, an email or a file, into `input` or `instructions`. It would read as trusted `user` or `system` text. Fetch it through a tool with a `source` guard, so it keeps its origin. See [guards.md](guards.md).
- Chaining to a response from another process, or from before a restart, adds an untrusted placeholder, so the run counts as untrusted from then on. Stateless loops that resend the whole input work too: the tool call ids in the input tie each request to its run.
- Streams pass through unchanged. A tool call is checked as soon as its arguments are complete, before that event reaches the app, and one `model_call` is recorded when the stream ends.
- Cost comes from Quard's price table. A model the table doesn't list adds no cost, but each call still counts as a step.
- Use one wrapped client for the agent's model calls. Make side calls you don't want in the run, such as an evaluator or a detector, with a plain client.

## What passes through

- Every other request through the client goes out and comes back unchanged, with no record and no checks: Chat Completions, embeddings, files, images, audio, and `GET` requests such as `responses.retrieve()`. A Chat Completions agent gets no labels, no checks on requested tool calls and no run limits, so move it to the Responses API.
- Output fetched later with `responses.retrieve()`, as in background mode, is not checked: its tool calls are never seen. Responses over a WebSocket (`ResponsesWS`) and the Realtime API don't use `fetch`, so Quard sees nothing of them.
- A Responses request whose body Quard can't read goes out as it is, with an `unreadable_request` warning. Quard never edits a response, and the only change to a request is the hosted tool shaping above. When the request fails or the response is not ok, the error or the response reaches the app unchanged, recorded as a `model_call` with the status `error`.

## Tool calls the model asks for

For each `function_call` in a response, Quard checks whether the agent may use that tool, by the `tools` list of `quard.run()`, `quard.agent()` or `quard.resume()`. It records a `permission` decision with the rule `requested-call` and remembers the call. The call stays in the response.

- Run each call through its guarded function, with the arguments the model wrote: `JSON.parse(call.arguments)`. The guard matches the remembered call by tool name and arguments, joins its run, and refuses it if the agent may not use the tool.
- Send back what the guarded function returns, as the `function_call_output` for that `call_id`: the result, or `result.text` when `isGuardRefusal(result)` is true. A refusal (`GuardRefusal`) is the fixed text the model reads in place of the result. See [guards.md](guards.md).
- Wrap every function tool with `guard()`, even harmless ones. An unwrapped tool runs unchecked with an `unwrapped_tool` warning, and its result reads as `unknown` content, which makes the run untrusted.

## Refused model calls

Run limits cap each run's model calls (`steps`, 200 by default) and estimated cost (`costUsd`, 5 US dollars by default). When they are enforced and a run is over one, the wrapped client answers the model call itself with HTTP 403, so nothing goes to OpenAI. The OpenAI client throws `OpenAI.PermissionDeniedError`, an `OpenAI.APIError`, and doesn't retry:

| Field     | Value                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `status`  | `403`                                                                                                    |
| `type`    | `"quard_blocked"`                                                                                        |
| `code`    | `"limit_reached"`                                                                                        |
| `message` | `403 Blocked by the limit guard: a limit for this run was reached. The gpt-5.4-mini call did NOT run. …` |

```ts
import OpenAI from "openai";
import { quard } from "quard";

const client = quard.wrap(new OpenAI());

export async function answer(question: string): Promise<string> {
    try {
        return await quard.run({ agent: "assistant" }, async () => {
            const response = await client.responses.create({ model: "gpt-5.4-mini", input: question });
            return response.output_text;
        });
    } catch (error) {
        // A run limit refused the model call before it left the process
        if (error instanceof OpenAI.APIError && error.type === "quard_blocked") {
            return "This task reached its step or cost limit, so it stopped.";
        }
        throw error;
    }
}
```

- Run limits start in observe mode, which records "would block" and refuses nothing, until `runLimits.mode` is `"block"` (see [guards.md](guards.md)). A streamed call throws the same error from `responses.create()`, before any event.
- Never retry the call: the run stays over its limit. A `quard.run()` that ends with this error records the run as `blocked`.

## Hosted tools

Hosted tools, such as web search and hosted MCP servers, run inside OpenAI during the model call, so Quard can't stop one midway. It shapes the request before it leaves and checks what comes back. Give them rules with `hostedTools` in `quard.configure()`, or under `guards` in the policy file, which wins tool by tool. A rule uses the name the model uses: `web_search`, or the hosted MCP tool's name, on any server. `web_search` uses only `source` rules, and an MCP tool uses only `limit`, `action`, `egress` and `approval` rules.

```ts
import OpenAI from "openai";
import { quard } from "quard";

quard.configure({
    hostedTools: {
        // Searches stay on acme.com and its subdomains
        web_search: [{ type: "source", origin: "web", allowDomains: ["*.acme.com"] }],
        // Hosted MCP rules use the MCP tool's name
        create_issue: [{ type: "limit", maxCallsPerRun: 3 }],
        delete_repo: [{ type: "approval", timeout: 300 }],
    },
});

const client = quard.wrap(new OpenAI());
const model = "gpt-5.4-mini";
const tools: OpenAI.Responses.Tool[] = [
    { type: "web_search" },
    { type: "mcp", server_label: "github", server_url: "https://mcp.example.com/mcp" },
];

const text = await quard.run({ agent: "dev" }, async () => {
    let response = await client.responses.create({ model, tools, input: "File an issue for the login bug." });
    for (let turn = 0; turn < 5; turn++) {
        // Quard's decision for each MCP approval request in the response
        const answers = await quard.mcpApprovals(response);
        if (answers.length === 0) {
            break;
        }
        response = await client.responses.create({ model, tools, previous_response_id: response.id, input: answers });
    }
    return response.output_text;
});
console.log(text);
```

### Web search

- Quard adds `web_search_call.action.sources` to `include`, keeping what you set, so the response lists the sites a search used.
- An enforced `source` rule with `allowDomains` becomes the tool's `filters.allowed_domains`. Your own list is narrowed to the domains both allow. `web_search_preview` has no filters, so it is not limited.
- Each site a search opened, listed or cited becomes untrusted content such as `web:docs.acme.com`, flagged `unscanned`, because Quard never sees the page text. The run turns untrusted and flagged.
- Each site is checked against `allowDomains` and `blockDomains`. The search already ran, so a site an enforced rule refuses is flagged `blocked_domain`, not stopped.
- Write `*.acme.com`. OpenAI's filter for `acme.com` also covers its subdomains, but Quard's check matches `acme.com` only itself, so `docs.acme.com` would be flagged.
- Quard never saw the page text, so values the model copies from it count as model-generated, found nowhere in the run. For scanning and exact tracing, fetch pages through your own tool with a `source` guard.

### Hosted MCP servers

- Quard sets `require_approval: "always"` on every `type: "mcp"` tool, so OpenAI asks before each MCP tool call and Quard decides.
- `await quard.mcpApprovals(response)` returns one `mcp_approval_response` item for each approval request in the response. Send them as the `input` of the next request, with `previous_response_id`, as above. Quard never sends that request itself, so skip this step and no hosted MCP tool call ever runs.
- Each request meets the checks a guarded call meets: permission first, so a run with a `tools` list must name the MCP tool, then the `limit`, `action`, `egress` and `approval` rules for its name. An `approval` rule waits for a person, through the dashboard or your `approver`.
- A refused request gets `approve: false`, with the refusal text as the `reason` the model reads. A request Quard never saw is refused. Each request is decided once, so asking again gives the same answers.
- What an MCP tool returns becomes untrusted content from `mcp:<server_label>`, flagged `unscanned`. To trust a server you own, set its origin's trust: see [policy-and-detector.md](policy-and-detector.md).

### Other hosted tools

File search, code interpreter, image generation, computer use and the other hosted tools pass through. Quard records the model call, but doesn't check or label what those tools do, and `hostedTools` rules for their names have no effect.

## The OpenAI Agents SDK

`quard/openai-agents` connects Quard to `@openai/agents` `^0.18.0`. Install it with `npm install "@openai/agents@^0.18.0" "zod@^4"`, and configure Quard as [setup.md](setup.md) shows.

```ts
import { Agent } from "@openai/agents";
import OpenAI from "openai";
import { guardedTool, quardRunner } from "quard/openai-agents";
import { z } from "zod";

// readPage, findSupplier and pay are the app's own functions
const fetchPage = guardedTool({
    name: "fetchPage",
    description: "Read a web page",
    parameters: z.object({ url: z.string() }),
    execute: async ({ url }) => readPage(url),
    guard: { type: "source", origin: "web" },
});

// Any guard labels the result, here with the origin tool:getSupplier
const getSupplier = guardedTool({
    name: "getSupplier",
    description: "Look up a supplier's bank details in our records",
    parameters: z.object({ name: z.string() }),
    execute: async ({ name }) => findSupplier(name),
    guard: { type: "limit", maxCallsPerRun: 5 },
});

const payInvoice = guardedTool({
    name: "payInvoice",
    description: "Pay an invoice by bank transfer",
    parameters: z.object({ iban: z.string(), amount: z.number() }),
    execute: async ({ iban, amount }) => pay(iban, amount),
    guard: { type: "action", rules: [{ field: "iban", from: ["tool:getSupplier"] }] },
});

const billing = new Agent({ name: "billing", instructions: "Pay invoices.", tools: [payInvoice] });
const triage = new Agent({
    name: "triage",
    instructions: "Find the invoice and the supplier's bank details, then hand off to billing.",
    tools: [fetchPage, getSupplier],
    handoffs: [billing],
});

// Every run() of this runner is one Quard run
const runner = quardRunner({ client: new OpenAI() });
const result = await runner.run(triage, "Pay the invoice at https://acme-billing.net/invoices/114.");
console.log(result.finalOutput);
```

- Build every function tool with `guardedTool()`: the SDK's `tool()` options plus `guard`, one guard or a list. The guards take the tool's name, and a `name` set in a guard is replaced. A tool built with the plain `tool()` runs unchecked, with an `unwrapped_tool` warning.
- Run agents only with the runner `quardRunner()` returns. It takes `client`, your OpenAI client, wrapped or not, and any other `RunConfig` field except `modelProvider`, and sends model calls over HTTP through the wrapped client, using the Responses API. Never use the SDK's top-level `run()` or another `Runner`: Quard doesn't follow them, so their model calls go unrecorded, and outside `quard.run()` each of their guarded calls starts a run of its own.
- Each `runner.run()` is one Quard run, named after the first agent, or it joins the current `quard.run()`. A streamed run ends when its stream ends.
- The agent comes from the framework. A handoff switches it and records a `handoff` event. An agent run as a tool, with `agent.asTool()`, runs under its own name, one level deeper. Values are traced across the whole run, so an IBAN the triage agent read on a web page is still refused in billing's `payInvoice` after the handoff.

### When a guard blocks

- By default the `quard` output guardrail rejects the result. The model reads the refusal text as the tool result, and `result.toolOutputGuardrailResults` holds it.
- With `onBlock: "throw"`, the run stops and `runner.run()` rejects with `GuardBlockedError`, whose `cause` is the SDK's `ToolCallError`. A streamed run gives the same error through `result.completed`, its events and `result.error`. Inside an agent run as a tool, it stops only that agent.
- An `approval` guard waits inside the call, for the dashboard or your `approver`. The SDK's own `needsApproval` still works beside it, and a run resumed from `result.state` goes on in the same Quard run.
- When the SDK gives up on a call, on the tool's `timeoutMs`, an aborted run or a failed sibling call, the wait stops, the call uses no limits and the tool never runs.
- With `outputSchema`, real results are checked against it. A refusal is not, so the model still reads it.

### Hosted tools in the Agents SDK

`webSearchTool()` gets the same shaping and labels as above. Quard also sets `require_approval: "always"` on every `hostedMcpTool()`, so without an `onApproval`, each MCP call stops the run as an interruption. Give each hosted MCP tool `requireApproval: "always"` and an `onApproval` that asks Quard:

```ts
import { hostedMcpTool } from "@openai/agents";
import { quard } from "quard";

// Quard sets require_approval to "always", so each call is answered here
export const github = hostedMcpTool({
    serverLabel: "github",
    serverUrl: "https://mcp.example.com/mcp",
    requireApproval: "always",
    onApproval: async (_context, item) => {
        const [answer] = await quard.mcpApprovals({ output: [item.rawItem.providerData] });
        return { approve: answer?.approve ?? false, reason: answer?.reason };
    },
});
```

### Known gaps

- An agent whose `model` is a `Model` object, not a name, skips the wrapped client. Its model calls go unrecorded, though its guarded tools still work.
- An agent tool with its own `runConfig.modelProvider` is not followed.
- Handoffs are not delegate calls, so they don't count toward the `fanOut` run limit (how many helpers one agent sends work to) or the `loops` limit (turns back and forth between two agents). To check those, give the tool that sends work a `limit` guard with `delegateTo`: see [multi-agent.md](multi-agent.md).

## More

- Docs: [Hosted tools](https://github.com/oynozan/quard/blob/main/docs/content/concepts/hosted-tools.mdx), [OpenAI Agents SDK](https://github.com/oynozan/quard/blob/main/docs/content/integrations/openai-agents.mdx) and [The wrapped client](https://github.com/oynozan/quard/blob/main/docs/content/sdk/internals/monitor.mdx), which follows one request through the monitor.
- [`monitor/fetch.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/monitor/fetch.ts), [`monitor/hosted/answer.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/monitor/hosted/answer.ts) and [`integrations/openai-agents/runner.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/integrations/openai-agents/runner.ts): the code.
- [`sandbox/21-streaming-and-model-calls.ts`](https://github.com/oynozan/quard/blob/main/sandbox/21-streaming-and-model-calls.ts) and [`sandbox/24-openai-agents-sdk.ts`](https://github.com/oynozan/quard/blob/main/sandbox/24-openai-agents-sdk.ts): runnable examples.
