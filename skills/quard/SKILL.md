---
name: quard
description: Quard is a guard layer for AI agents in TypeScript and Node.js. It labels where everything an agent reads came from, traces values such as IBANs and email addresses back to where they first appeared, and checks each tool call before it runs, so a call driven by prompt injection, or one that would leak data, is refused. It also asks people for approvals, caps x402 payments, enforces run limits and records every run in the Quard dashboard, hosted or self-hosted. Use this skill when a user mentions Quard, wants to guard an AI agent's tool calls, stop prompt injection or data leaks, add human approvals or spending limits, check x402 payments, or add Quard to an app built on the OpenAI Responses API, the OpenAI Agents SDK or a multi-agent setup.
license: See the repository at https://github.com/oynozan/quard
metadata:
  author: oynozan
  docs: https://github.com/oynozan/quard/tree/main/docs/content
  source: https://github.com/oynozan/quard
---

# Quard

Quard is a guard layer for AI agents. It wraps an app's OpenAI client and the app's tools. It labels everything the agent reads with where it came from, traces each value in a tool call back to where it first appeared, and checks the call before it runs. A blocked call never reaches the tool: the model gets a short refusal in its place and tells the user. Every run, approval and incident (a run where a guard blocked a call, or would have) shows up in the Quard dashboard.

Guards run inside the app's own process, so they work with no backend at all. The backend adds the dashboard, approvals answered there, daily limits shared by every process, and the fleet check, which blocks an IBAN, email address or domain everywhere when many separate runs suddenly use it.

Use this skill when the user mentions Quard, when an agent reads untrusted content (web pages, email, files, MCP servers, other agents) and can also act (pay, email, refund, delete, deploy), or when the user wants approvals, caps on calls, amounts, cost or x402 payments (an agent paying for an HTTP request on the spot), or a record of every run. Quard watches model calls made with the `openai` package's Responses API, directly or through the OpenAI Agents SDK. Chat Completions calls and other clients pass through unrecorded: `guard()` still checks the tools, but Quard can't see what the model read.

Docs: https://github.com/oynozan/quard/tree/main/docs/content. Source: https://github.com/oynozan/quard. When this skill and the code disagree, the code wins: [`packages/sdk/index.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/index.ts) lists every export.

## Vocabulary

- **Run.** One task from start to finish, across every agent that works on it. `quard.run()` starts one. Labels, value tracing and per-run limits all count per run.
- **Agent.** A named worker in a run, such as `billing`. `quard.agent()` runs a helper agent inside the current run.
- **Label.** Where a piece of content came from: an **origin**, such as `user`, `web:acme.com`, `email:readInbox`, `mcp:crm` or `tool:getSupplier`, a **trust**, `trusted` or `untrusted`, and a **sensitivity**, `internal` or `public`. The origin comes from the guarded tool that let the content in, never from the content. By default the user, the app's instructions and its own tools are trusted, and web pages, email, files and MCP servers are not.
- **Value tracing.** For each IBAN, email address, URL, domain, file path, wallet address or id-like value in a call's arguments, Quard finds where it first appeared in the run. A value found nowhere is **model-generated**.
- **Guard.** A check wrapped around one tool. `guard()` takes five types: `source`, `action`, `approval`, `egress` and `limit`. The `x402` guard wraps a payment client instead.
- **Decision.** What a guard decides about a call: `allow`, `ask` (wait for a person) or `block`. For content a source tool returned: `pass`, `flag`, `strip` or `block`.
- **Refusal.** What a blocked call returns in place of the tool's result: a `GuardRefusal`, whose fixed text the model reads.
- **Mode.** `block`, the default, enforces a rule. `observe` records "would block" or "would ask" and lets the call run.
- **Run limits.** Caps per run on delegation depth, fan-out (how many helper agents one agent starts), loops between two agents, model calls and cost. They start in observe mode.
- **Policy file.** An optional JSON file of guard rules and settings. The app rereads it while it runs, and it wins over code.
- **Backend.** The services behind the dashboard, hosted or self-hosted: `webhook` takes events, `control` keeps a live link for approvals and shared counters, `worker` finds the cause of incidents in the background, and `web` is the dashboard.

## Install

```sh
npm install quard openai
```

This skill describes quard 0.2.0 and later, where an app never sets a hash key. If `npm view quard version` prints 0.1.x, build the current SDK from the repository instead, which needs Node.js 24 or later and pnpm:

```sh
git clone https://github.com/oynozan/quard.git && cd quard
pnpm install && pnpm --filter quard build && pnpm --filter quard pack
```

`pack` writes the tarball in the clone's root folder and prints its path. In the app, run `npm install /path/to/that.tgz openai`.

- The app needs Node.js 22.12 or later. The SDK is an ES module, so load it with `import`. In TypeScript, set `moduleResolution` to `"nodenext"`, `"node16"` or `"bundler"`: the older `"node"` setting can't find the package.
- Inside the Quard repository's own pnpm workspace, depend on `"quard": "workspace:*"` instead, and run `pnpm --filter quard build` first: the package loads from its `dist` folder.
- Optional peers: `@openai/agents` `^0.18.0` for `quard/openai-agents`, and `@x402/core` `^2.28.0` for x402 payments.
- The backend is optional: one `compose.yaml` at the repository root starts it. The SDK reads no environment variables itself. The app passes `QUARD_AGENT_KEY` (an agent key, `qk_live_…`), `QUARD_WEBHOOK_URL` (`http://localhost:4100` for a local backend) and `QUARD_CONTROL_URL` (`http://localhost:4200` for a local backend) to `quard.configure()`, as the example below does. The app never sets a hash key: the SDK gets its project's key from the backend with the agent key.

Every install path, the backend and each setting are in [references/setup.md](references/setup.md).

## Integrate step by step

1. **Check the app.** It needs Node.js 22.12 or later, ES modules, and model calls through the `openai` package's Responses API, `client.responses.create()`. On the OpenAI Agents SDK, build each tool with `guardedTool()` and run agents with `quardRunner()`, which take care of steps 4 to 7: see [references/openai.md](references/openai.md).
2. **Install** `quard` and `openai` as above.
3. **Configure once at startup.** Call `quard.configure()` before the first model call. Pass the three backend settings together, or none of them. Read the keys from the environment, never from code. Add `approver` when people answer approvals in code instead of the dashboard.
4. **Wrap the client.** `const client = quard.wrap(new OpenAI())`, then use that copy for every model call. The original client stays unwatched.
5. **Guard every tool the model can call.** Wrap each tool function with `guard(fn, options)`, with `name` set to the exact tool name the model sees. Pick the type with the table below. Read-only tools on the app's own data need a guard too, so Quard can label what they return.
6. **Send refusals back.** In the agent loop, call the guarded function. When `isGuardRefusal(result)` is true, send `result.text` as that call's tool output.
7. **One task, one run.** Wrap each user task in `quard.run({ agent: "name" }, fn)`. Pass `tools` to limit which guarded tools that agent may use. Helpers in the same task run in `quard.agent()`: see [references/multi-agent.md](references/multi-agent.md).
8. **Start in observe mode.** Ship each rule with `mode: "observe"`, watch it on real traffic, then enforce it. See below.
9. **Add what the app needs.** Approvals, run limits and permissions are in [references/guards.md](references/guards.md). The policy file and the AI detector, an optional AI check on what source tools return, are in [references/policy-and-detector.md](references/policy-and-detector.md). Hosted web search and hosted MCP are in [references/openai.md](references/openai.md), and x402 in [references/payments.md](references/payments.md).
10. **Verify.** Run one task with an `onEvent` handler that prints `warning` events. `unwrapped_tool` means the model called a tool with no guard, or a guard whose `name` doesn't match. Then add a test per rule: guards need no model, so call the guarded function inside `quard.run()` with input the rule must stop, and expect `isGuardRefusal(result)` to be true. An egress allow list only checks calls in a run that read internal data, so in its test, first call a guarded tool that reads the app's own data.

## Minimal example

A payment agent that can read web pages. The source guard labels each page untrusted and scans it for hidden instructions. The action guard pays only an IBAN that appeared in the user's own message, and 5000 EUR at most.

```ts
import OpenAI from "openai";
import { guard, isGuardRefusal, quard } from "quard";

// Optional: send runs to your Quard dashboard. With these unset, guards still run.
quard.configure({
    key: process.env.QUARD_AGENT_KEY,
    webhookUrl: process.env.QUARD_WEBHOOK_URL,
    controlUrl: process.env.QUARD_CONTROL_URL,
});

// Every model call goes through this copy
const client = quard.wrap(new OpenAI());

// Outside content: labeled untrusted and scanned for hidden instructions
const fetchPage = guard(async ({ url }: { url: string }) => (await fetch(url)).text(), {
    type: "source",
    name: "fetchPage",
    origin: "web",
});

async function sendPayment(input: { iban: string; amount: number }) {
    return `Paid ${input.amount} EUR to ${input.iban}`;
}

// The IBAN must come from the user's own message, and 5000 EUR at most
const payInvoice = guard(sendPayment, {
    type: "action",
    name: "payInvoice",
    rules: [
        { field: "iban", from: ["user"] },
        { field: "amount", max: 5000 },
    ],
});

const tools: Record<string, (args: never) => Promise<unknown>> = { fetchPage, payInvoice };

// What the model sees. Each name is the guard's `name`.
function define(name: string, description: string, fields: Record<string, string>): OpenAI.Responses.FunctionTool {
    const properties = Object.fromEntries(Object.entries(fields).map(([key, type]) => [key, { type }]));
    const parameters = { type: "object", properties, required: Object.keys(fields), additionalProperties: false };
    return { type: "function", name, description, parameters, strict: true };
}

const request = {
    model: "gpt-5.4-mini",
    tools: [
        define("fetchPage", "Read a web page", { url: "string" }),
        define("payInvoice", "Pay an invoice by bank transfer", { iban: "string", amount: "number" }),
    ],
};

// What the model reads back: a refusal's text, or the tool's result
function toolOutput(result: unknown): string {
    if (isGuardRefusal(result)) {
        return result.text;
    }
    return typeof result === "string" ? result : JSON.stringify(result);
}

async function runTask(prompt: string): Promise<string> {
    let response = await client.responses.create({ ...request, input: prompt });
    for (let turn = 0; turn < 8; turn++) {
        const calls = response.output.filter((item) => item.type === "function_call");
        if (calls.length === 0) {
            break;
        }
        const input: OpenAI.Responses.ResponseInput = [];
        for (const call of calls) {
            const tool = tools[call.name];
            const result = tool ? await tool(JSON.parse(call.arguments) as never) : `Unknown tool: ${call.name}`;
            input.push({ type: "function_call_output", call_id: call.call_id, output: toolOutput(result) });
        }
        response = await client.responses.create({ ...request, previous_response_id: response.id, input });
    }
    return response.output_text;
}

// One task is one run: labels and per-run limits cover all of its steps
const answer = await quard.run({ agent: "billing" }, () =>
    runTask("Pay the invoice at https://acme-billing.example/invoices/114 with the bank details it lists."),
);
console.log(answer);
```

The model reads the page and asks to pay the IBAN on it. That IBAN first appeared in `web:acme-billing.example`, not in the user's message, so `sendPayment` never runs, and the model reads this as the tool result:

```text
Blocked by the action guard: the iban value did not come from an allowed source. The payInvoice call did NOT run. Do not retry it; tell the user what was blocked.
```

Ask it to pay an IBAN typed in the prompt, up to 5000 EUR, and the payment goes through. The run still ends as `completed` when a call was refused: a refusal is a tool result, not an error.

## Pick the guard

| The tool                                                                      | Guard                                                                       | Example                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Reads outside content: web pages, search results, email, files, MCP results   | `source`, with `origin` set to `web`, `email`, `file` or `mcp`              | `{ type: "source", name: "fetchPage", origin: "web" }`                                                                |
| Reads messages from another agent                                             | `source` with `origin: "agent"`, called a receive guard                     | `{ type: "source", name: "readMessage", origin: "agent" }`                                                            |
| Reads the app's own data, such as supplier records                            | `limit` with a generous cap. Its results are labeled `tool:<name>`, trusted | `{ type: "limit", name: "getSupplier", maxCallsPerRun: 20 }`                                                          |
| Acts on values that must come from a known place: pay, refund, delete, deploy | `action`, with `from`, `max`, `neverSeen` or custom `check` rules           | `{ type: "action", name: "payInvoice", rules: [{ field: "iban", from: ["tool:getSupplier"] }] }`                      |
| Sends data out: email, HTTP posts, uploads, webhooks                          | `egress`, with an `allow` list of hosts or addresses                        | `{ type: "egress", name: "sendEmail", allow: ["acme.com"] }`                                                          |
| Must never run without a person's yes                                         | `approval`                                                                  | `{ type: "approval", name: "deleteRepo", timeout: 600 }`                                                              |
| May run only so often, or for so much, per run or per day                     | `limit`                                                                     | `{ type: "limit", name: "refundOrder", maxCallsPerDay: 20 }`                                                          |
| Hands work to another agent                                                   | `limit` with `delegateTo`, which checks depth, fan-out and loops            | `{ type: "limit", name: "delegate", delegateTo: "to" }`                                                               |
| Pays with x402                                                                | `x402`, on the x402 client                                                  | `quard.x402(client, { type: "x402", maxPerPayment: 0.1, maxPerRun: 1 })`                                              |
| Runs inside OpenAI: hosted web search, hosted MCP                             | Rules by tool name in `hostedTools`                                         | `quard.configure({ hostedTools: { web_search: [{ type: "source", origin: "web", allowDomains: ["*.acme.com"] }] } })` |
| Reads and writes a store that agents share                                    | `quard.memory()` around the store                                           | `quard.memory(store, { name: "notes" })`                                                                              |

- One tool can take several guards: pass a list. Only one of them needs `name`. The strictest result wins: block, then ask, then allow.
- A source guard checks what the tool returned, after it runs. The others check the call before it runs.
- Action rules and the egress allow list can ask a person instead of blocking, with `onFail: "ask"`. A `neverSeen` rule asks by default. Every option, default and rule shape is in [references/guards.md](references/guards.md).

## How refusals reach the model

A blocked call never runs. What the app gets depends on where the block happened:

| Where                                   | What the app gets                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A guarded function, by default          | A `GuardRefusal` value, not an error. Send its `text` to the model as the tool output                                            |
| A guard with `onBlock: "throw"`         | A thrown `GuardBlockedError`, with `refusal`, `guard` and `reason`. A run it ends is recorded as `blocked`                       |
| A model call over an enforced run limit | The OpenAI client throws its `APIError`, status 403, with `type: "quard_blocked"` and `code: "limit_reached"`. It is not retried |
| A source guard                          | A `GuardRefusal` with the reason `content_blocked`: the tool ran, but its result was withheld                                    |
| An x402 payment                         | The x402 client throws an `Error` holding the refusal text. Inside a guarded tool, the tool returns a `GuardRefusal` instead     |
| A hosted MCP call                       | `quard.mcpApprovals()` answers `approve: false`, with the refusal text as `reason`                                               |
| A `guardedTool()` in the Agents SDK     | The model reads the refusal as the tool result. With `onBlock: "throw"`, `run()` rejects with `GuardBlockedError`                |

A `GuardRefusal` holds `guard`, `tool`, `reason`, `field` and `text`. `reason` is a reason code such as `value_not_from_allowed_origin`, and [references/guards.md](references/guards.md) lists them all. `String(refusal)` gives the text, and `JSON.stringify(refusal)` gives `{ blocked, guard, reason, message }`.

Catch thrown blocks around `quard.run()`. `error instanceof GuardBlockedError` is a guard with `onBlock: "throw"`, and `error instanceof OpenAI.APIError && error.type === "quard_blocked"` is a model call a run limit refused. Rethrow any other error.

Rules for the app:

- Send the refusal text to the model unchanged, as the result of that tool call. It comes from fixed templates and never quotes argument values or outside content, so it is safe to pass on. Never swap it for a generic error.
- Never retry a refused call, call the unguarded function as a fallback, or loosen a rule to get one call through. Tell the user what was blocked.
- Log `guard`, `reason` and `field` for your own metrics. They hold no argument values.
- `approval_unavailable`, `approval_timed_out` and `backend_unavailable` mean no person answered: no approver was set, the wait ran out, or the backend was down. Fix the approver, the timeout or the backend, not the prompt.

## Roll out in observe mode first

1. Give each rule you add `mode: "observe"`. It records what it would have done, "would block" or "would ask", and the call runs. Approval guards have no mode: they always ask, so add them only where someone is ready to answer.
2. A source guard in observe mode still labels its content, so other rules keep working. It only stops flagging, stripping and blocking.
3. Run limits start in observe mode. The AI detector enforces by default, so start it with `detectorRules: { mode: "observe" }`. A signature feed, a list of known attack patterns, takes `mode: "observe"` too.
4. Watch the decisions in the dashboard's runs and incidents, or print them in code:

```ts
import { guard, quard } from "quard";

// Records what it would block, and lets every call run
const guardedSendEmail = guard(sendEmail, { type: "egress", name: "sendEmail", allow: ["acme.com"], mode: "observe" });

// Prints each "would block" and "would ask", with no values in it
quard.configure({
    onEvent: (event) => {
        if (event.type === "decision" && !event.enforced && event.decision !== "allow" && event.decision !== "pass") {
            console.log(`would ${event.decision}: ${event.tool} (${event.guard} guard, ${event.reason ?? event.rule})`);
        }
    },
});
```

5. When the "would block" calls are the ones you meant to stop, remove `mode: "observe"`: `"block"` is the default. Or switch the mode in the policy file: Quard rereads it at most once a second, so the change applies with no redeploy. A tool listed in the file uses only the file's guards, so copy its whole guard list there. Functions, such as custom `check` rules, can't go in the file.

## Common mistakes

- **Model calls around the wrapper.** Calls through the original client, or through Chat Completions, are neither recorded nor checked. Use the wrapped copy and `client.responses.create()` everywhere.
- **A tool with no `guard()`.** The model can still call it. Quard records an `unwrapped_tool` warning but can never stop it, and labels its result `unknown`, which is untrusted.
- **A `name` that differs from the tool name the model sees.** Quard can't match the model's call to its guard, so it reports the tool as unwrapped and labels its result `unknown`.
- **Outside content without a source guard.** A web, email, file or MCP tool guarded only by a limit is labeled `tool:<name>` and trusted, so values injected into it pass the rules.
- **Runs that are too small or too big.** A `quard.run()` per model call or per tool call splits one task, so value tracing and per-run limits break. A run around a whole server loop mixes tasks. One user task, one run.
- **Half the backend settings.** `key` goes with `webhookUrl`, `controlUrl` or both, or `configure()` throws. An empty or unset value counts as not set.
- **A hash key in the app.** Apps never set one. The server keeps `QUARD_HASH_KEY`, and the SDK gets its project's key with the agent key. `quard.configure()` has no `hashKey` option.
- **An approval guard with nobody to ask.** With no `approver` and no control link, every call is refused with `approval_unavailable`. With no `timeout`, a call waits until someone answers.
- **Hosted MCP without `quard.mcpApprovals()`.** The wrapped client sets `require_approval: "always"` on every hosted MCP server, so those tools only run once the app sends Quard's answers.
- **The Agents SDK's own runner.** A plain `Runner`, the SDK's `run()` and tools made with `tool()` skip Quard. Use `quardRunner()` and `guardedTool()`.
- **Broad trust overrides.** Trust only exact origins the team runs, such as `"mcp:crm.acme.internal"`. Never mark web pages, email or someone else's MCP server trusted to silence a block.
- **Logging events as they are.** `onEvent` gets each event before redaction, with real argument values. Keep them out of third-party logs.
- **`process.exit()` right after the work.** The last events upload on Node's `beforeExit`, which `process.exit()` skips.

## References

- [references/setup.md](references/setup.md): requirements, install paths, running the backend with `compose.yaml`, environment variables, every `quard.configure()` option, `quard.wrap()` and `quard.run()`, what is recorded and uploaded, redaction, a backend that is down, and testing.
- [references/openai.md](references/openai.md): what the wrapped client watches in the Responses API, blocked model calls, hosted web search and hosted MCP with `quard.mcpApprovals()`, and the OpenAI Agents SDK with `quardRunner()` and `guardedTool()`.
- [references/guards.md](references/guards.md): `guard()`, each guard type with its options and defaults, block and observe mode, run limits, tool permissions for delegated agents, refusal texts and reason codes.
- [references/policy-and-detector.md](references/policy-and-detector.md): the policy file, origin overrides, the AI detector with `jevDetector()`, and signature feeds.
- [references/multi-agent.md](references/multi-agent.md): `quard.agent()` and delegation, runs across processes with `quard.inject()`, `quard.resume()` and `quard.toBaggage()`, receive guards, and shared memory with `quard.memory()`.
- [references/payments.md](references/payments.md): x402 payments with `quard.x402()`, `quard.x402Fetch()` and `quard.x402Mcp()`, what is recorded, and payment refusals.

## Docs

- [Self-host Quard](https://github.com/oynozan/quard/blob/main/docs/content/self-host.mdx), and the ideas without code: [Guards](https://github.com/oynozan/quard/blob/main/docs/content/concepts/guards.mdx), [Labels and trust](https://github.com/oynozan/quard/blob/main/docs/content/concepts/labels.mdx), [Value tracing](https://github.com/oynozan/quard/blob/main/docs/content/concepts/value-tracing.mdx), [Approvals](https://github.com/oynozan/quard/blob/main/docs/content/concepts/approvals.mdx), [Run limits](https://github.com/oynozan/quard/blob/main/docs/content/concepts/run-limits.mdx) and [Hosted tools](https://github.com/oynozan/quard/blob/main/docs/content/concepts/hosted-tools.mdx).
- The SDK reference: [quard](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/quard.mdx), [guard()](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/guard.mdx), [Refusals and errors](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/refusals.mdx), [OpenAI Agents SDK](https://github.com/oynozan/quard/blob/main/docs/content/integrations/openai-agents.mdx) and the [Glossary](https://github.com/oynozan/quard/blob/main/docs/content/glossary.mdx).
- [Run the examples](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/index.mdx): 28 runnable programs in [`sandbox`](https://github.com/oynozan/quard/tree/main/sandbox), numbered 00 to 27, with a plain agent loop in [`sandbox/lib/agent.ts`](https://github.com/oynozan/quard/blob/main/sandbox/lib/agent.ts).
