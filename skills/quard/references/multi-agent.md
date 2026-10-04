# Multi-agent apps

This file covers apps where several agents share a task: helper agents with `quard.agent()`, delegate tools and their limits, carrying a run to another process with `quard.inject()`, `quard.resume()` and `quard.toBaggage()`, receive guards and the label records behind them, and shared memory with `quard.memory()`.

## Contents

- [Words used here](#words-used-here)
- [Pick the pattern](#pick-the-pattern)
- [Helper agents in one process](#helper-agents-in-one-process)
- [Delegate tools](#delegate-tools)
- [Agents in other processes](#agents-in-other-processes)
- [Receive guards](#receive-guards)
- [Label records](#label-records)
- [Shared memory](#shared-memory)
- [Common mistakes](#common-mistakes)
- [More](#more)

## Words used here

- **Run**: one task from start to finish, started by `quard.run()`. Everything in it shares one set of labels and one set of per-run limits. See [setup.md](setup.md).
- **Agent**: the name a piece of work runs under, such as `"billing"`. It shows in the dashboard, and each agent can be limited to a list of guarded tools.
- **Label**: where content came from (its origin, such as `web:acme.com` or `agent:orchestrator`), whether it is trusted, and whether it is internal or public. Quard also traces values such as IBANs and email addresses back to where they first appeared, and each **traced value** keeps the label it had there.
- **Depth**: how many delegation levels an agent sits below the agent that started the run. That agent is at depth 0.
- **Carrier**: the three items that travel with a message to another process: the run id, the sender's last step id and a label reference. The reference points to the **label record** the sender stored: the label of what it had read and of each traced value in the message, never the message itself.
- **Receive guard**: a source guard with `origin: "agent"`. It reads a message from another agent and gives it the labels the sender stored.

## Pick the pattern

| Your agents | Use |
| --- | --- |
| Several agents in one process, started by your code | `quard.agent()` inside `quard.run()` |
| A model hands work to another agent through a tool call | A delegate tool with a limit guard and `delegateTo` |
| Agents in separate processes or services | `quard.inject()` and `quard.toBaggage()` to send, `quard.resume()` and a receive guard to receive |
| Agents that share a store: notes, a vector database, a cache | `quard.memory()` |
| The OpenAI Agents SDK, with handoffs or `agent.asTool()` | `quardRunner()`, which follows the framework's agents. See [openai.md](openai.md) |

## Helper agents in one process

`runAgent` stands for your own model loop: a client from `quard.wrap()` that runs the tools the model asks for.

```ts
import { guard, quard } from "quard";

const lookupOrder = guard(lookupOrderRaw, { type: "limit", name: "lookupOrder" });
const refundOrder = guard(refundOrderRaw, { type: "limit", name: "refundOrder", maxCallsPerRun: 3 });
const tools = { lookupOrder, refundOrder };

await quard.run({ agent: "support" }, async () => {
    await runAgent("Refund order 1001.", tools);
    // A helper in the same run that may only look orders up
    await quard.agent("faq-bot", () => runAgent("Where is order 1002?", tools), { tools: ["lookupOrder"] });
});
```

| Parameter | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | `string` | required | The helper's agent name |
| `fn` | `() => T` | required | The helper's work. `quard.agent()` returns what it returns |
| `options.tools` | `string[]` | the parent's tools | The guarded tools the helper may use, by their guard `name` |

- The helper shares the run. Everything the run read keeps its label in the helper's calls, and per-run limits count across both. Outside a run, `quard.agent()` throws `quard.agent() must be called inside quard.run()`.
- `tools` can only narrow. The helper keeps the tools on its list that its parent may use, never more. `quard.run({ agent, tools })` sets the first agent's list the same way.
- A call to a guarded tool off the list returns a refusal with the reason `permission_denied`, and the tool doesn't run. A tool not wrapped with `guard()` can't be stopped, only recorded with an `unwrapped_tool` warning. Wrap every tool.
- Each `quard.agent()` sits one depth level below its parent. The helper's model calls point at the parent's last step, so the dashboard's run graph draws the helper under its parent.

## Delegate tools

When a model hands work to another agent through a tool call, give that tool a limit guard with `delegateTo`: the input field that names the receiving agent. Quard then checks three run limits before each call:

| Rule | Run limit, default | Refuses the call when |
| --- | --- | --- |
| `max-depth` | `depth`, 3 | The sending agent's depth plus one is above the limit |
| `max-fan-out` | `fanOut`, 10 | The sender would delegate to more different agents than the limit |
| `max-loops` | `loops`, 5 | The same two agents would pass work back and forth more turns than the limit |

In one process, the delegate tool runs the helper with `quard.agent()`:

```ts
import { guard, quard } from "quard";

// The guarded tools each helper may use. Other names get none.
const HELPER_TOOLS: Record<string, string[]> = { billing: ["getSupplier", "payInvoice"], research: ["fetchPage"] };

const delegate = guard(
    async (input: { to: string; task: string }) =>
        quard.agent(input.to, () => runAgent(input.task, allTools), { tools: HELPER_TOOLS[input.to] ?? [] }),
    { type: "limit", name: "delegate", delegateTo: "to" },
);
```

- `delegateTo` is a field path into the tool's input, such as `"to"` or `"target.agent"`. Give the tool one object argument. Without a non-empty string at that path, only depth is checked.
- Run limits start in observe mode: they record "would block" and let the call run. `quard.configure({ runLimits: { mode: "block" } })` enforces them, and the guard's own `mode` doesn't change that. The other run limits, on steps and cost, are in [guards.md](guards.md).
- A refused call gets a refusal with the reason `limit_reached`, and the tool doesn't run. The helper and the turn count only once the tool is about to run, after every check and approval.
- Each process counts fan-out and loops on its own. Depth travels with messages to other processes.

## Agents in other processes

When the receiving agent runs in another process or service, the run and its labels travel with the message. The sender stores a label record and sends a carrier beside the message. The receiver looks the record up and labels the message with it.

1. **Configure every process** with `key`, `webhookUrl` and `controlUrl`, as [setup.md](setup.md) shows. The sender stores records through uploads (`webhookUrl`, the `webhook` service), and the receiver looks them up through the control link (`controlUrl`, the `control` service). Use agent keys from the same project in every process: records match by keyed hashes made with the project's hash key, which each process gets from the backend. A process with another project's agent key reads every message as untrusted.
2. **Send.** Inside the tool that sends, call `quard.inject({ content })` with the exact value you send. It returns a promise of the carrier. For HTTP, put `quard.toBaggage(carrier)` in the W3C `baggage` header:

```ts
import { guard, quard } from "quard";

// Where each agent in another service takes its tasks
const AGENT_URLS: Record<string, string> = { billing: "http://billing.internal:8080/tasks" };

const delegate = guard(
    async (input: { to: string; brief: string }) => {
        const url = AGENT_URLS[input.to];
        if (url === undefined) {
            return `There is no agent named ${input.to}.`;
        }
        // Stores the brief's labels and returns the carrier
        const carrier = await quard.inject({ content: input.brief });
        const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", baggage: quard.toBaggage(carrier) },
            body: JSON.stringify({ brief: input.brief }),
        });
        return response.text();
    },
    { type: "limit", name: "delegate", delegateTo: "to" },
);
```

- `quard.inject()` throws `quard.inject() must be called inside quard.run()` outside a run. A guarded tool always runs inside one, so call it there, once per message, just before the message leaves.
- With uploads or the control link on, it sends the record to `webhook` and waits up to 5 seconds for it to be stored. If it isn't stored, because uploads are off or `webhook` didn't store it in time, Quard records a `label_record_not_stored` warning, the message still goes out, and a receiver in another process reads it as untrusted.
- Put the carrier in the metadata slot of your channel: the `baggage` header for HTTP, `_meta` for MCP, `metadata` for A2A, attributes for a queue. `quard.toBaggage()` writes the members `quard-run`, `quard-parent` and `quard-labels`. If the request already has a `baggage` header, join the two with a comma.

3. **Receive.** Wrap the handler's work in `quard.resume(carrier, fn, options)`. It runs `fn` inside the run the carrier names, as the agent you name, and returns a promise of what `fn` returns. Read the message through a receive guard inside it:

```ts
import { guard, isGuardRefusal, quard } from "quard";

// Your HTTP handler calls this with the brief and the baggage header
async function onBrief(brief: string, baggage: string | undefined): Promise<string> {
    // The receive guard returns the brief exactly as the sender injected it
    const readMessage = guard(async () => brief, { type: "source", origin: "agent", name: "readMessage" });
    return quard.resume(
        baggage,
        async () => {
            const message = await readMessage();
            return isGuardRefusal(message) ? message.text : runAgent(message, billingTools);
        },
        { agent: "billing" },
    );
}
```

| Parameter | Type | Default | What it does |
| --- | --- | --- | --- |
| `carrier` | `unknown` | required | A carrier object, or a whole `baggage` header string |
| `fn` | `() => T` | required | The receiving agent's work |
| `options.agent` | `string` | `"default"` | The receiving agent's name |
| `options.tools` | `string[]` | the sender's tools | The guarded tools this agent may use. It can only narrow the sender's list |

- Quard looks the record up in this process first, then through `control`, for up to 5 seconds. With the record, the agent sits one depth level below the sender and may use at most the sender's tools.
- Without it, Quard records a `label_record_not_found` warning. Only `options.tools` limits the agent, so set it. Its depth is past any depth limit, so it can't delegate once run limits block.
- A missing or unreadable carrier starts its own run instead, as `quard.run()` would, and messages read in it are `agent:unknown`, untrusted. Otherwise the run started elsewhere, so `quard.resume()` records no run start or end.
- With the control link on, once a run crosses processes, `control` keeps its steps, cost and per-run counters, so caps hold across every process. Fan-out and loop counts stay per process.

## Receive guards

A receive guard is a source guard whose `origin` is exactly `"agent"`. Wrap every function that reads messages from other agents with one.

- The function must return the message exactly as the sender gave it to `quard.inject()`: the same string, or a value with the same JSON. A trimmed string, an added field or a parsed copy doesn't match.
- Don't pass the message text in as the function's argument. Values a tool gets as arguments aren't labeled again when they come back out. Pass where to find the message, or close over it as the sample does.
- Without `carrierOf`, the guard uses the carrier `quard.resume()` came in with. When each message brings its own carrier, as in a queue, set `carrierOf`. It gets the function's input and returns a carrier object or a baggage string:

```ts
import { guard } from "quard";

// Each queued message keeps its own carrier, as a baggage string
const readQueued = guard(async (input: { id: string; baggage: string }) => inbox.get(input.id) ?? "", {
    type: "source",
    origin: "agent",
    name: "readQueued",
    carrierOf: (input) => (input as { baggage?: string }).baggage,
});
```

| The message | Origin | Trust and sensitivity | Traced values in it |
| --- | --- | --- | --- |
| Verified: a record of the carrier's run matches this exact content | `agent:<sender>` | From the record: what the sender had read when it sent. An origin override for `agent:<sender>` still wins | Each keeps the label it had in the sender's run, so a web IBAN stays `web:…` |
| Not verified: no carrier, no record, a record of another run, or changed content | `agent:unknown`, or `agent:<sender>` when a record didn't match | Untrusted and internal. Origin overrides don't apply | They take the message's label |

- In a verified, trusted message, a value the record doesn't vouch for was written by the sender's model. It stays model-generated for the rest of the run, so a `neverSeen` rule still asks or blocks it.
- Each read records a `message` event: the sender (`unknown` when not verified), the carrier's step and label reference, `verified`, and the label. The run graph draws it as an edge between the two agents.
- After the label, the guard works as any source guard: the scan, `onSuspect`, the signature feed and the detector. See [guards.md](guards.md). A full origin such as `"agent:billing"` makes a plain source guard that looks nothing up, so use exactly `"agent"`.
- A policy file entry for the receive tool replaces its code options, and JSON can't hold `carrierOf`. Keep a tool that needs `carrierOf` out of the policy file.

## Label records

- A record holds the label reference, the sender's run, step, name and depth, a keyed hash of the whole content (its print), the sender run's label (trust, sensitivity, origins, and whether anything was flagged), each traced value as a keyed hash with the label it had where it first appeared, and the sender's tool list when it is limited. Quard never stores the message itself, and raw values never leave the process.
- A sender run that read nothing can't say where its content came from, so its record is untrusted and internal. A value the sender's model made up is left out of the record.
- In one process no backend is needed: the process keeps up to 10,000 of its own records. The backend keeps message records as long as runs, 30 days unless the project changes it.

## Shared memory

Wrap a store that agents share with `quard.memory(store, { name })`. What goes in keeps its labels, and what comes back out gets them again, in any agent, process or later run.

```ts
import { quard } from "quard";

const items = new Map<string, string>();
const notes = quard.memory(
    {
        get: (key: string) => items.get(key),
        put: (key: string, text: string) => {
            items.set(key, text);
        },
    },
    { name: "notes" },
);

// Use it inside your tools, and wrap those tools with guard() as usual
await notes.put("acme", "Acme Ltd pays to DE89 3704 0044 0532 0130 00.");
const note = await notes.get("acme");
```

| Method on your store | Kind | What Quard labels |
| --- | --- | --- |
| `get` | Read | What it returns, as one item |
| `search`, `read` | Read | What it returns: one item per list element, else one item |
| `put(key, value)` | Write | `value`, the second argument |
| `write(value)` | Write | `value`, the first argument |

- Your store may have any of these. In the wrapper they return promises, even when yours don't. Other methods and properties pass through. Each read or write joins the current run, or else starts one.
- `name` is 1 to 200 characters, or `quard.memory()` throws. Items read back get the origin `memory:<name>`.
- On write, Quard first stores the item's labels, keyed by a hash of the whole item: the run's label and the first label of each traced value. Then it calls your method. The write goes ahead even when the labels couldn't be stored.
- On read, an item with labels gets them back, and each value keeps its first origin, so a web IBAN in a note is still `web:…`. When several writes stored labels for the same content, the least trusted wins.
- An item with no labels reads as untrusted and internal, and origin overrides don't apply to it. That happens when it was changed outside the wrapper, written without it, or read back in another shape.
- Write one item per call, in the shape your reads return. A batch write is labeled as one item, so its elements read back one by one have no labels. Don't add fields on read, such as a search score.
- Each read and write records a `memory` event: the store, `read` or `write`, how many items, how many had labels (`verified`; for a write, 1 only when the backend stored them), and the label. This process reads back its own labels with no backend, for up to 10,000 items. For other processes, set uploads and the control link with agent keys from the same project, as for messages. Memory labels are never deleted with runs.

## Common mistakes

- Starting a helper with `quard.run()` inside a run. That starts a second run without the first run's labels. Use `quard.agent()`.
- Building a delegate tool's URL from the model's argument. Look the agent up in a fixed map, as the sample does.
- Sending a value other than the one given to `quard.inject()`, or returning a changed one from the receive function. The print doesn't match, and the message reads as untrusted.
- Uploads off on the sender, or the control link off on the receiver. Look for `label_record_not_stored` and `label_record_not_found` warnings.
- `allowDomains` or `blockDomains` on a receive guard. Agent names aren't hosts, so `allowDomains` blocks every message and `blockDomains` marks every one as suspect.

## More

- Concepts: [multi-agent](https://github.com/oynozan/quard/blob/main/docs/content/concepts/multi-agent.mdx), [shared memory](https://github.com/oynozan/quard/blob/main/docs/content/concepts/shared-memory.mdx), [run limits](https://github.com/oynozan/quard/blob/main/docs/content/concepts/run-limits.mdx), [retention](https://github.com/oynozan/quard/blob/main/docs/content/concepts/retention.mdx).
- Reference: [quard](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/quard.mdx), [messages between agents](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/messages.mdx), [shared memory](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/memory.mdx), [run limits](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/run-limits.mdx), [source guard](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/source-guard.mdx).
- Examples: [agents and permissions](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/agents-and-permissions.mdx), [agents in two processes](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/agents-in-two-processes.mdx), [shared memory](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/shared-memory.mdx), [run limits](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/run-limits.mdx).
- Code: [`context/scope.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/context/scope.ts), [`context/carrier.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/context/carrier.ts), [`memory/wrap.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/memory/wrap.ts), and the runnable [`sandbox/22-agents-in-two-processes.ts`](https://github.com/oynozan/quard/blob/main/sandbox/22-agents-in-two-processes.ts) and [`sandbox/23-shared-memory.ts`](https://github.com/oynozan/quard/blob/main/sandbox/23-shared-memory.ts).
