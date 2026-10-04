# Guards

How to wrap tools with `guard()`: each guard type with its options, rule shapes, defaults and examples, block and observe modes, run limits, tool permissions for agents, and the refusals a block produces.

## Contents

- [guard()](#guard), then the [source](#source-guard), [action](#action-guard), [approval](#approval-guard), [egress](#egress-guard) and [limit](#limit-guard) guards
- [Block mode and observe mode](#block-mode-and-observe-mode), [run limits](#run-limits), [tool permissions for agents](#tool-permissions-for-agents) and [refusals and reason codes](#refusals-and-reason-codes)

## guard()

`guard(fn, options)` wraps one tool function and returns a function with the same parameters. Every call runs Quard's checks first. A blocked call never reaches `fn`: it resolves to a `GuardRefusal` instead of the result. Errors that `fn` throws pass through unchanged, unless the x402 guard refused a payment inside it, see [payments.md](payments.md). `options` is one guard, or a list of guards for the same tool.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `type` | `"source"`, `"action"`, `"approval"`, `"egress"` or `"limit"` | required | The guard type. `"x402"` throws here: payments use `quard.x402()`, see [payments.md](payments.md) |
| `name` | `string` | required on one guard of the list | The exact tool name the model sees. Permissions, the policy file, refusals and rule history use it. `guard()` throws without it |
| `mode` | `"block"` or `"observe"` | `"block"` | See [Block mode and observe mode](#block-mode-and-observe-mode). The approval guard has no `mode` |
| `onBlock` | `"return"` or `"throw"` | `"return"` | `"throw"` throws a `GuardBlockedError` instead of returning the refusal |

- Wrap every tool the model can call, read-only ones too. Quard can't stop a tool without `guard()`. It only warns (`unwrapped_tool`) and labels the result `unknown`, which is untrusted, so values found only there fail `from` and `neverSeen` rules. A guard with no rules, such as `{ type: "limit", name: "getSupplier" }`, still records each call and labels the result `tool:getSupplier`, which is trusted. Use it on your own data tools.
- In a list, the first `name` names the tool. Every guard checks every call, and the strictest result wins: block, then ask, then allow. Before the call the checks run in this order: the agent's permission to use the tool, the signature feed (known attack strings, see [policy-and-detector.md](policy-and-detector.md#signature-feeds)), then limit, action, egress and approval guards. A source guard checks the result after the call, and only the first source guard in a list counts.
- One argument is checked as itself. Several arguments are checked as a list, so field paths start with the position, such as `[1].amount`. Paths use dots and brackets, such as `invoice.amount` or `items[0].to`. A `from` or `neverSeen` rule on a field covers the values nested in it, and a `max` rule reads the field itself.
- With the OpenAI Agents SDK, use `guardedTool()` from `quard/openai-agents`. It runs every call through `guard()` and takes the tool's own name. See [openai.md](openai.md).

## Source guard

Use it on tools that bring outside content in: web fetch, search, inbox readers, file readers and MCP clients. It runs after the tool returns and before the model reads the result. It gives the result an origin (where the content came from, such as `web:acme.com`), checks the origin's host, and scans the text for content aimed at an AI.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `origin` | `string` | required | A kind, such as `"web"`, `"email"`, `"mcp"` or `"file"`, or a full origin such as `"mcp:crm"`. `"agent"` receives messages from other agents, with `carrierOf` to find each message's carrier, see [multi-agent.md](multi-agent.md) |
| `originOf` | `(input: unknown) => string \| undefined` | none | Returns the part of the origin after the kind, such as a sender, from the call's input |
| `blockDomains` | `string[]` | none | Hosts whose content is withheld. `"evil.com"` is that host only, `"*.evil.com"` adds its subdomains |
| `allowDomains` | `string[]` | none | When set, content from any other host is withheld, and so is an origin that names no host |
| `onSuspect` | `"flag"`, `"strip"` or `"block"` | `"flag"`, or the policy file's [strictness preset](policy-and-detector.md#the-policy-file) | What a scan finding does |

- A full origin, one with a colon, is used as it is. Otherwise Quard adds `originOf(input)` to the kind, else the host of the first URL in the input, else the first host name, else the domain of the first email address, else the tool's name. So `fetchPage({ url: "https://Docs.Acme.com/a" })` with `origin: "web"` is `web:docs.acme.com`.
- `web`, `email` and `mcp` content is untrusted and public by default, `file` and `agent` content untrusted and internal. To trust one exact origin, see [policy-and-detector.md](policy-and-detector.md#origin-overrides).
- The scan finds text that speaks to an AI, such as "ignore previous instructions" (`instructions`), text shaped like a tool call (`tool_call_text`), hidden characters or styling (`invisible_text`), and an origin with no host while `blockDomains` is set (`unknown_host`). After the scan, the signature feed and the AI detector check the result too, see [policy-and-detector.md](policy-and-detector.md).
- `flag` passes the result with the findings as flags on its label, and a value seen only in flagged content then fails `from` and `neverSeen` rules. `strip` first removes hidden characters and the lines that look suspect. `block` withholds the result with `content_blocked`, though the tool did run. A failed host check blocks, whatever `onSuspect` says.

```ts
import { guard } from "quard";

// A web page: untrusted and public. Strip lines that look like instructions.
const fetchPage = guard(rawFetchPage, { type: "source", name: "fetchPage", origin: "web", onSuspect: "strip" });

// The origin is email:bob@acme.com instead of email:acme.com
const readEmail = guard(rawReadEmail, {
    type: "source",
    name: "readEmail",
    origin: "email",
    originOf: (input) => (input as { from?: string }).from,
});
```

## Action guard

Use it on tools that change something: payments, emails, deletes and deploys. Before each call it checks the arguments against `rules`. The guard's `mode` applies to all of its rules.

| Rule | Fails when | Default `onFail` | Reason |
| --- | --- | --- | --- |
| `{ field, from }` | A traced value in the field never appeared in unflagged content from an origin in `from`, or the field holds no traced value | `"block"` | `value_not_from_allowed_origin`, or `value_model_generated` when the value appeared nowhere in the run |
| `{ field, max }` | The field, read with `Number()`, is above `max` or is not a number. A missing field passes | `"block"` | `amount_over_cap` |
| `{ field, neverSeen: true }` | A traced value in the field did not first appear in trusted, unflagged content, or the field holds no traced value | `"ask"` | `recipient_never_seen` |
| `{ name, check }` | `check(call)` returns `"block"` or `"ask"` | none | `rule_failed` |

- Quard traces IBANs, email addresses, URLs, host names, file paths, wallet addresses and ids, which have 8 or more characters, a digit and no spaces. Names, dates and most amounts are not traced, so never put `from` or `neverSeen` on such a field. Use `max` or a custom check.
- A `from` entry matches that origin and every origin under it: `"tool"` matches any tool result, `"tool:getSupplier"` one tool, `"web"` any web page and `"user"` the user's messages. A `tool:<name>` origin exists only when that tool is wrapped with a guard other than a source guard.
- `onFail: "ask"` sends the call to a person instead of blocking it. `from`, `max` and `neverSeen` rules take an optional `name` for decision events, the records Quard keeps of each rule's result.
- `check` gets the call: `tool`, `input`, `agent`, `runId`, `stepId`, `depth`, `values`, which says where each traced argument value appeared, and `context`, the run's combined label with `trust`, `sensitivity`, `origins` and `flagged`. It returns `"allow"`, `"block"`, `"ask"` or `{ decision, field }` at once, never a promise. A throw rejects the call, and the tool does not run.

```ts
import { guard } from "quard";

// Your own records: no rules, but the result is labeled tool:getSupplier, which is trusted
const getSupplier = guard(rawGetSupplier, { type: "limit", name: "getSupplier" });

const payInvoice = guard(rawPayInvoice, {
    type: "action",
    name: "payInvoice",
    rules: [
        // The IBAN must come from the supplier records or the user's own message
        { field: "iban", from: ["tool:getSupplier", "user"] },
        { field: "amount", max: 10000, onFail: "ask" },
        // Your own check: a person decides once the run has read flagged content
        { name: "flagged-run-asks", check: (call) => (call.context.flagged ? "ask" : "allow") },
    ],
});
```

## Approval guard

Use it on high-stakes tools. Every call waits for a person, and the tool runs only with exactly the arguments the person saw. It has no `mode`. Its own option is `timeout`: the seconds to wait before the call is refused with `approval_timed_out`. Without it, the call waits with no limit, so in serverless functions and HTTP handlers set it below the host's own time limit. Quard asks, in this order:

1. The `approver` function set with `quard.configure()`. It gets `{ runId, agent, stepId, tool, input, values }` and returns `"once"`, `"always"` or `"deny"`. `"always"` also lets later calls with the same agent, tool and exact arguments run without asking, until the process ends. Any other answer denies, and a throw refuses the call with `approval_unavailable`.
2. A person on the dashboard's Approvals page, when the control link is on: `key` and `controlUrl` set, see [setup.md](setup.md). If `control` can't be reached for 30 seconds, the call is refused with `backend_unavailable`.
3. Nobody. The call is refused with `approval_unavailable`, so set up one of the two before you add any ask.

- Other rules ask too: any rule with `onFail: "ask"`, a failed `neverSeen` rule, a custom check that returns `"ask"`, and a `flag` signature on the arguments. The same approver or dashboard answers them. The wait limit comes only from an approval guard's `timeout` on the same tool.
- After a yes, the block checks run again, so a limit reached during the wait still refuses the call.

```ts
import { guard, quard } from "quard";

// Answers approvals in code. Without it, the dashboard answers through the control link.
quard.configure({
    approver: async (request) => ((await askOnCall(`${request.agent} wants ${request.tool}`)) ? "once" : "deny"),
});

const deleteRecords = guard(rawDeleteRecords, { type: "approval", name: "deleteRecords", timeout: 600 });
```

## Egress guard

Use it on tools that send data out: email, HTTP posts, uploads and webhooks. It finds where the call sends data and runs three checks.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `allow` | `string[]` | none, so nothing is allowed | Allowed destinations. `"acme.com"` is that host only, `"*.acme.com"` adds its subdomains and `"bob@acme.com"` is one address |
| `destinations` | `(input: unknown) => string[]` | the top-level fields `to`, `cc`, `bcc`, `recipient`, `recipients`, `email`, `emails`, `url`, `endpoint`, `host`, `webhook`, `target` and `destination`, in any letter case | Returns the destinations of a call whose arguments have another shape |
| `onFail` | `"block"` or `"ask"` | `"block"` | What a failed `allowlist` check does |
| `payload` | `{ secrets?, cards?, ibans? }`, each `"allow"`, `"mask"` or `"block"` | the strictness preset. Without a policy file: secrets `block`, cards `mask`, IBANs `allow` | What to do with that kind of data in the arguments |

- `untrusted-destination` blocks, whatever `onFail` says, a destination that first appeared in untrusted content, such as a web page: `destination_from_untrusted_content`.
- `allowlist` fails when the call carries internal data and a destination is not on `allow`, or no destination was found. It does what `onFail` says, with `destination_not_allowed`. A call carries internal data once the run has read anything internal, such as the user's message or your own tool's result, so in practice put every legitimate destination on `allow`.
- `payload:<kind>` blocks a secret, card number or IBAN set to `block`, or set to `mask` when it could not be masked: `sensitive_data`. `mask` replaces the value before the checks, the approver and the tool see it, with `•••• 4242`, `DE89…3000` or `[secret removed by Quard]`.

```ts
import { guard } from "quard";

const sendEmail = guard(rawSendEmail, { type: "egress", name: "sendEmail", allow: ["*.acme.com"], onFail: "ask" });

// rawPostJson(url, body) takes two arguments, so the input is a list
const postJson = guard(rawPostJson, {
    type: "egress",
    name: "postJson",
    allow: ["hooks.acme.com"],
    destinations: (input) => [(input as [string, unknown])[0]],
});
```

## Limit guard

Use it on any tool to cap calls and amounts, and on a tool that hands work to another agent to cap delegation.

| Option | Type | Default | What it caps |
| --- | --- | --- | --- |
| `maxCallsPerRun` | `number` | none | Calls to this tool in one run. `0` refuses every call |
| `maxAmountPerRun` | `{ field, max }` | none | The total of `field` over this tool's calls in one run |
| `maxCallsPerDay` | `number` | none | Calls per UTC day, across every process of the project |
| `maxAmountPerDay` | `{ field, max }` | none | The total of `field` per UTC day, across every process |
| `fleetCheck` | `string[]` | none | Fields whose IBANs, emails and domains the fleet check watches |
| `delegateTo` | `string` | none | The field that names the receiving agent, for the run limits `depth`, `fanOut` and `loops` |

- Amounts are read with `Number()`. A missing field adds 0, and a negative or non-number amount is refused. A call counts just before it runs, after every check and any approval, so a refused call adds nothing. Per-run counts cover all agents of the run, and the reason over a per-run cap is `limit_reached`.
- Per-day limits and the fleet check need the control link to share counts. Without it, per-day limits count in each process alone (`daily_limit_reached`), and the fleet check does nothing.
- The fleet check blocks a value everywhere (`value_quarantined`) when it was first seen in the project less than 7 days ago and a fifth separate run uses it within 24 hours. For 7 days after the project's first fleet report it only observes. A person releases a value by marking it known on the dashboard.
- The `delegateTo` rules follow the run limits' `mode`, not this guard's.

```ts
import { guard } from "quard";

// Two guards on one tool: one name is enough
const payInvoice = guard(rawPayInvoice, [
    { type: "action", name: "payInvoice", rules: [{ field: "iban", neverSeen: true }] },
    { type: "limit", maxCallsPerRun: 3, maxAmountPerDay: { field: "amount", max: 200000 }, fleetCheck: ["iban"] },
]);

// "to" names the agent that receives the message
const sendMessage = guard(rawSendMessage, { type: "limit", name: "sendMessage", delegateTo: "to" });
```

## Block mode and observe mode

- `"block"` enforces, and is the default for every guard you write. `"observe"` runs every check and records "would block" or "would ask" as a decision event with `enforced: false`, but the call runs unchanged: nothing is masked, stripped, withheld or asked. A limit guard in observe mode still counts calls.
- `mode` covers the guard's own rules. The permission check always enforces, and the signature feed follows its own `mode`. The run limits and the fleet check's first 7 days start in observe mode.
- To roll a rule out, add it with `mode: "observe"`, then watch its decisions on the dashboard, or in `onEvent` as decision events with `enforced: false` whose `decision` is not `allow` or `pass`. Once they look right, remove `mode`. A policy file can change `mode` without a redeploy.

## Run limits

Run limits cap a whole run across all of its agents. They apply to every run, with nothing to switch on, and start in observe mode.

| Field | Type | Default | What it caps | Checked on |
| --- | --- | --- | --- | --- |
| `mode` | `"block"` or `"observe"` | `"observe"` | `"block"` enforces all five limits | |
| `depth` | whole number | `3` | Delegation levels below the agent that started the run | Tools with `delegateTo` |
| `fanOut` | whole number | `10` | Different agents one agent delegates to | Tools with `delegateTo` |
| `loops` | whole number | `5` | Turns back and forth between the same two agents | Tools with `delegateTo` |
| `steps` | whole number | `200` | Model calls across all agents | Every model call of the wrapped client |
| `costUsd` | `number` | `5` | Estimated US dollars, from token usage and Quard's price table | Every model call of the wrapped client |

- Set them with `quard.configure({ runLimits })` or `runLimits` in the policy file, which wins field by field. A later `configure()` with `runLimits` replaces the earlier value as a whole. Each `quard.agent()` is one level deeper. A model with no known price adds no cost, so only `steps` caps it.
- In block mode, a guarded tool over `depth`, `fanOut` or `loops` returns a refusal with `limit_reached`. A model call over `steps` or `costUsd` never leaves the process: the OpenAI client throws its 403 `APIError` with `type: "quard_blocked"` and `code: "limit_reached"`, and a run that ends with that error is recorded as `blocked`. Catch it where you start the run. See [openai.md](openai.md).

```ts
import OpenAI from "openai";
import { quard } from "quard";

quard.configure({ runLimits: { mode: "block", steps: 50, costUsd: 2 } });

try {
    await quard.run({ agent: "team" }, () => runTeam());
} catch (error) {
    if (!(error instanceof OpenAI.APIError && error.type === "quard_blocked")) {
        throw error;
    }
    console.warn(`The run passed a run limit: ${error.message}`);
}
```

## Tool permissions for agents

`quard.run()` and `quard.agent()` take `tools`: the names of the guarded tools the agent may use. A call to any other guarded tool is refused with `permission_denied`, and the tool does not run. Without `tools`, the agent may use every guarded tool.

```ts
import { quard } from "quard";

await quard.run({ agent: "support", tools: ["lookupOrder", "refundOrder"] }, async () => {
    await runSupportAgent();
    // The FAQ bot may only look orders up
    await quard.agent("faq-bot", () => runFaqBot(), { tools: ["lookupOrder"] });
});
```

- A child agent can only lose tools: it keeps the ones in its list that its parent may also use. `quard.agent()` throws outside `quard.run()`. `quard.resume()` takes `tools` the same way in another process, see [multi-agent.md](multi-agent.md).
- The wrapped client marks a model's call to a tool the agent may not use as blocked, and the guarded function refuses it when your loop runs it. Permissions only cover tools wrapped with `guard()`.

## Refusals and reason codes

A blocked call resolves to a `GuardRefusal` with `blocked: true`, `guard`, `tool`, `reason`, `field` (the field, kind of data or signature id it is about, if any) and `text`. Send `text` back to the model as the tool's output, like any result. `String(refusal)` gives the text, and `JSON.stringify(refusal)` gives `{ blocked, guard, reason, message }`. With `onBlock: "throw"`, a `GuardBlockedError` is thrown instead, with the refusal as `error.refusal`. The text comes from fixed templates and never quotes argument values or outside content:

```text
Blocked by the action guard: the iban value did not come from an allowed source. The payInvoice call did NOT run. Do not retry it; tell the user what was blocked.
Blocked by the source guard: the content looked unsafe. The fetchPage result was withheld. Do not retry it; tell the user what was blocked.
```

Reason codes by guard. Decision events carry them in `reason` too, also for asks and observe mode, except that source and detector decisions list their findings or labels there. The codes that start with `x402_` come from the x402 guard, see [payments.md](payments.md).

- `permission`: `permission_denied`, the agent may not use the tool.
- `action`: `value_not_from_allowed_origin`, `value_model_generated`, `amount_over_cap`, `recipient_never_seen` and `rule_failed`.
- `egress`: `destination_from_untrusted_content`, `destination_not_allowed` and `sensitive_data`, whose `field` is `secret`, `card number` or `IBAN`.
- `limit`: `limit_reached` for per-run caps and run limits, `daily_limit_reached` and `value_quarantined`.
- `approval`: `approval_denied`; `approval_timed_out`, also for a call aborted while it waited; `approval_unavailable` when no one could be asked, the approver threw or the request could not be shown; `backend_unavailable`; and `approval_required` when the arguments changed after the yes. A denied ask from any rule names the approval guard.
- `source` and `signature`: `content_blocked` for a withheld result. `signature` also gives `signature_matched` for arguments that match a `block` signature, and `signatures_unavailable` while a URL feed has not loaded.
- `abort`: `call_aborted`, when the caller gave up on the call after its checks.

Full docs: [guard()](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/guard.mdx), [source](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/source-guard.mdx), [action](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/action-guard.mdx), [approval](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/approval-guard.mdx), [egress](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/egress-guard.mdx), [limit](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/limit-guard.mdx), [run limits](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/run-limits.mdx) and [refusals](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/refusals.mdx).
