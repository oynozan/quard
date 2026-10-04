# Setup

How to install the Quard SDK and run its backend, every `quard.configure()` option, `quard.wrap()` and `quard.run()`, what Quard records and uploads, what still works when the backend is down, and how to test an app that uses Quard.

Terms used here: a **run** is one task from start to finish. A **guard** wraps one tool function and checks each call before it runs. A **label** says where content came from (its origin, such as `user` or `web:acme.com`) and whether it is trusted. The **agent key** is the secret the SDK sends to the backend. The server's **hash key** hashes IBANs and emails: each project gets its own key derived from it, and the SDK fetches its project's key with the agent key, so the app never holds one.

## Contents

- [Requirements](#requirements)
- [Install the SDK](#install-the-sdk)
- [Run the backend](#run-the-backend)
- [Environment variables](#environment-variables)
- [quard.configure()](#quardconfigure)
- [quard.wrap()](#quardwrap)
- [quard.run()](#quardrun)
- [What Quard records and uploads](#what-quard-records-and-uploads)
- [When the backend is down](#when-the-backend-is-down)
- [Testing](#testing)
- [More](#more)

## Requirements

- Node.js 22.12 or later. The SDK is an ES module only, so load it with `import`.
- In TypeScript, set `moduleResolution` to `nodenext`, `node16` or `bundler`. The package declares its types only under `exports`, which `node10` (also written `"node"`) can't read.
- The `openai` package. Quard watches the Responses API through the client you wrap. Chat Completions calls pass through with no record and no checks, so move the agent's model calls to `client.responses.create()`.
- Optional peers: `@openai/agents` `^0.18.0` with `zod` `^4` for the `quard/openai-agents` entry point (see [openai.md](openai.md)), and `@x402/core` `^2.28.0` for x402 payments (see [payments.md](payments.md)).
- The backend is optional. Guards run inside the app without it. The backend adds the dashboard, approvals answered there, per-day limits shared by every process, the fleet check (it blocks an unknown IBAN, email address or domain once many runs use it at once), and labels that cross processes.

## Install the SDK

```sh
npm install quard openai
```

This skill describes quard 0.2.0 and later, where an app never sets a hash key. Check with `npm view quard version`. If it prints 0.1.x, build the current SDK from a clone and install the tarball instead. The clone needs Node.js 24, which its `.nvmrc` and `engines` ask for, and pnpm, which its `packageManager` field pins to 12.6.0.

```sh
git clone https://github.com/oynozan/quard.git
cd quard
pnpm install
pnpm --filter quard build
pnpm --filter quard pack
```

`pack` writes the tarball in the folder you run it from and prints its full path. Then, in the app, run `npm install /path/to/that.tgz openai`. `pnpm add` takes the same path.

- The package holds the built `dist`, with Quard's shared code bundled in. Its dependencies, `tldts`, `ws` and `zod`, install with it.
- Inside the Quard repository's own pnpm workspace, depend on `"quard": "workspace:*"` instead, and run `pnpm --filter quard build` first, because the package's `exports` point at `dist`.
- To update an npm install, run `npm install quard@latest`. To update a tarball install, `git pull` in the clone, run `pnpm install`, `build` and `pack` again, and install the rebuilt tarball.
- Check the install from the app folder: `node --input-type=module -e 'import { quard } from "quard"; console.log(typeof quard.wrap)'` prints `function`.

## Run the backend

Quard is a hosted service, and it can also be self-hosted from one `compose.yaml` at the root of the repository. Self-hosting starts `web`, the dashboard, on port 3000; `webhook`, which takes events and label records (stored labels that let another process trust a message or memory item) from the SDK, on 4100; `control`, the WebSocket the SDK keeps open for approvals, shared counters and the fleet check, on 4200; a `worker` that finds the cause of incidents (the record Quard opens for a run when a guard blocks a call, or only records that it would) and deletes old data; and Postgres, which a one-off `migrate` step sets up. On hosted Quard, or if the user already runs it, skip this: they sign in to the dashboard, create an agent key under Settings, put it in the app's environment themselves, and give you the webhook and control URLs.

1. The user creates a Privy app for dashboard sign-in, with Email and GitHub login on and the dashboard address, such as `http://localhost:3000`, under allowed domains. Only they can do this.
2. In the clone, run `cp .env.example .env`, then fill in `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `QUARD_HASH_KEY` (`openssl rand -hex 32`), `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` and `QUARD_SESSION_SECRET` (`openssl rand -hex 32`). The hash key stays on the server: agents never get it.
3. Run `docker compose up -d --build`. In `docker compose ps`, `postgres`, `webhook`, `control` and `web` show `healthy`, and `worker` is up.
4. Run `docker compose run --rm migrate node db/cli/setup-main.ts --project "Acme"`. It prints the project id and an agent key, the secret the SDK sends to the backend, as `qk_live_…`. The key is shown once. The dashboard makes more keys under Settings.
5. Check both services: `curl http://localhost:4100/health` answers `{"status":"ok","service":"webhook"}`, and port 4200 answers the same for `control`.

- `QUARD_WEB_PORT`, `QUARD_WEBHOOK_PORT` and `QUARD_CONTROL_PORT` in `.env` change the ports.
- On a server, put HTTPS in front. The agents must reach `webhook` and `control`, and the proxy must pass WebSocket upgrades through to `control`.
- Never commit `.env`, and never print the agent key or the server's hash key. Ask the user to put the agent key in the app's environment themselves, not in the chat.

## Environment variables

The SDK reads no environment variables. The app reads them and passes them to `quard.configure()`. These names are the ones the Quard docs and examples use:

| Variable            | Option       | Value                                                                      |
| ------------------- | ------------ | -------------------------------------------------------------------------- |
| `QUARD_AGENT_KEY`   | `key`        | The agent key, `qk_live_…`                                                 |
| `QUARD_WEBHOOK_URL` | `webhookUrl` | `http://localhost:4100` on a local install                                 |
| `QUARD_CONTROL_URL` | `controlUrl` | `http://localhost:4200` on a local install                                 |
| `OPENAI_API_KEY`    | none         | Read by the `openai` client itself                                         |

```ts
import { quard } from "quard";

// Off without an agent key, so local runs and tests upload nothing
const key = process.env.QUARD_AGENT_KEY;
if (key) {
    quard.configure({
        key,
        webhookUrl: process.env.QUARD_WEBHOOK_URL,
        controlUrl: process.env.QUARD_CONTROL_URL,
    });
}
```

- With an agent key set but no URL, `configure()` throws at startup. Keep it that way, so a half-set environment fails at once instead of running with uploads off.
- Never set a hash key in the app. The SDK asks the backend for its project's key with the agent key: `webhook` answers `GET /v1/hash-key`, and `control` sends it when the link opens. Until it arrives, events wait in the upload buffer, so nothing leaves the process unhashed.
- Load `.env` with `node --env-file=.env` or the app's own config loader.

## quard.configure()

`quard.configure(options: Partial<QuardConfig>): void`. Call it once at startup, before the first model call. A later call changes only the options it names.

| Option          | Type                                                    | Default                                                                       | What it does                                                                                                                   |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `key`           | `string`                                                | none                                                                          | The agent key                                                                                                                  |
| `webhookUrl`    | `string`                                                | none                                                                          | The `webhook` address. Events go to `/v1/events`, label records to `/v1/labels`                                                |
| `controlUrl`    | `string`                                                | none                                                                          | The `control` address, `http`, `https`, `ws` or `wss`. The SDK opens its WebSocket at `/v1/connect`                            |
| `onEvent`       | `(event: RunEvent) => void`                             | none                                                                          | Gets every event as it is recorded, unredacted                                                                                 |
| `approver`      | `(request: ApprovalRequest) => Promise<ApprovalAnswer>` | none                                                                          | Answers approvals in code instead of the dashboard: `"once"`, `"always"` or `"deny"`. See [guards.md](guards.md)               |
| `origins`       | `OriginOverrides`                                       | `{}`                                                                          | Trust and sensitivity for exact origins, such as `"mcp:crm"`. See [policy-and-detector.md](policy-and-detector.md)             |
| `policyFile`    | `string`                                                | none                                                                          | A JSON policy file, relative to the working directory. It wins over code. See [policy-and-detector.md](policy-and-detector.md) |
| `signatures`    | `SignaturesConfig`                                      | none                                                                          | A feed of known attack signatures, from a `file` or a `url`. See [policy-and-detector.md](policy-and-detector.md)              |
| `detector`      | `Detector`                                              | none                                                                          | An AI check on public content, such as `jevDetector({ apiKey })`. See [policy-and-detector.md](policy-and-detector.md)         |
| `detectorRules` | `Partial<DetectorRules>`                                | `{ mode: "enforce", flagAt: 0.5, stripAt: 0.9 }`                              | When the detector acts                                                                                                         |
| `runLimits`     | `Partial<RunLimits>`                                    | `{ mode: "observe", depth: 3, fanOut: 10, loops: 5, steps: 200, costUsd: 5 }` | Caps for every run. Observe mode records "would block" and stops nothing. See [guards.md](guards.md)                           |
| `hostedTools`   | `Record<string, GuardOptions[]>`                        | none                                                                          | Rules for hosted tools, by the name the model uses. See [openai.md](openai.md)                                                 |

Two backend connections start once their settings are complete:

| Connection   | Needs                          | What it does                                                                                                                                      |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uploads      | `key`, `webhookUrl`            | Gets the project's hash key, then sends every event, redacted, in batches, and stores label records                                                                                 |
| Control link | `key`, `controlUrl`            | One WebSocket for the project's hash key, dashboard approvals, per-day counts, the fleet check, the active rules, agent versions, runs across processes and label lookups |

- Set `key` and at least one URL together, in one call. Once any of the three is set, a missing `key` or URL throws. An empty string counts as unset.
- A later call that leaves a connection's settings alone keeps it running, and a changed setting restarts it. To stop one connection, set its URL to `undefined` while the other stays set. To stop both, set all three to `undefined`.
- Neither connection keeps the process alive, except while a call waits for an approval or for a reply from `control`.
- Setting an option to `undefined` clears it. `origins` merge origin by origin, so set an origin to `{}` to undo it. `runLimits` and `detectorRules` replace the earlier value whole. A call that names `policyFile` or `signatures` loads both again.
- Option names are not checked at run time, so let TypeScript check the call.
- `configure()` checks everything before it changes anything, and a throw keeps the old settings. Its errors start with `Uploads and the control link need key…`, `controlUrl must be an http, https, ws or wss URL`, `Invalid Quard configuration:` (a `TypeError` for an option with the wrong shape), `Quard could not load the policy file:` or `Quard could not load the signature feed:`.

## quard.wrap()

- `const client = quard.wrap(new OpenAI())` returns a copy of the client whose Responses API calls go through Quard. The client you pass in stays unwatched, so use the copy for every model call the agent makes.
- The copy keeps the client's own `fetch`, so a custom fetch or proxy still works. Wrapping a wrapped client, or a copy made from one, returns it as it is.
- Make side calls you don't want in the run, such as an evaluator or your own detector, with a separate unwrapped client.
- [openai.md](openai.md) covers what it reads, what passes through and how a refused model call looks.

## quard.run()

`quard.run<T>(options: RunOptions, fn: () => T): T`, where `RunOptions` is `{ agent?: string; runId?: string; tools?: string[] }`.

A run is one task from start to finish. Everything `fn` does belongs to it, across `await`: model calls through a wrapped client, calls to guarded tools, and the labels of everything the run reads. Per-run limits count across the whole run.

| Option  | Type       | Default            | What it does                                                                                                                        |
| ------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `agent` | `string`   | `"default"`        | The agent's name in every record and on the dashboard                                                                               |
| `runId` | `string`   | a random id        | A run id of your own. It must be 32 lowercase hex characters                                                                        |
| `tools` | `string[]` | every guarded tool | The tools this agent may use: guard `name`s and hosted MCP tool names. A call to any other tool is refused with `permission_denied` |

```ts
import OpenAI from "openai";
import { quard } from "quard";

const client = quard.wrap(new OpenAI());

// One support ticket is one run, by the agent "support"
export function answerTicket(ticket: string): Promise<string> {
    return quard.run({ agent: "support", tools: ["lookupOrder", "refundOrder"] }, async () => {
        const response = await client.responses.create({ model: "gpt-5.4-mini", input: ticket });
        // Run the tool calls and send the results back here, inside the run
        return response.output_text;
    });
}
```

- It returns what `fn` returns, a promise for an async `fn`. Errors pass through unchanged.
- It records `run_started`, then `run_finished` with the status `completed`, `failed` when `fn` threw, or `blocked` when the error was a `GuardBlockedError` or a model call that run limits refused.
- Put the whole task inside, including the loop that runs the tools and sends their results back. Each call starts a separate run, even inside another run. For a helper agent in the same run, use `quard.agent()` (see [multi-agent.md](multi-agent.md)).
- Never pass an empty `agent`, or a `runId` in any other format. Webhook then refuses the whole upload batch, and every event in it is lost.
- Outside `quard.run()`, a model call joins the run it continues through `previous_response_id`, `conversation` or a tool result in its input, and a guarded call joins the run of the model's matching tool call. Anything else starts a run of its own as `default`, which never records `run_finished` and starts its per-run limits from zero. So wrap every task.

## What Quard records and uploads

Quard records events in the process: `run_started`, `run_finished`, `model_call`, `tool_call`, `decision`, `content`, `warning`, `chunk_label`, `config_error`, `message`, `handoff`, `memory` and `payment`. The exported type `RunEvent` covers them all.

- `onEvent` gets each event as it happens, before redaction, with real values such as full tool arguments. Keep it fast. Quard ignores errors it throws. Redact before you send its events anywhere.
- Only guarded tools get `tool_call` events. A tool with no `guard()` shows up only in the model call that asked for it, with an `unwrapped_tool` warning. A `content` event holds a label and value keys, the traceable values such as `iban:DE89…` or `domain:acme.com`, never the text itself.
- While uploads are on, a `model_call` also holds the model's reply text and its request body, cut to the fields that incident replay resends to test a cause (`instructions`, `input` with the tool results sent back, `tools` and the like), when both together stay under 512 Ki characters.

Uploads send events to `webhook` about once a second, in batches of up to 500 events and 3 MiB:

- Before anything leaves the process, secrets are removed, IBANs, card numbers and emails are masked (`DE89…3000`, `4111…1111`, `j…@acme.com`), and fields named like `password`, `token`, `api_key`, `authorization` or `cookie` lose their values. IBAN and email keys get a keyed hash made with the project's hash key, so search still finds them. Each project's key is different, and `webhook` redacts again.
- An approval request is the exception: the person approving sees the real arguments, with only secrets removed. The backend clears them once the request is answered.
- `control` also gets each agent version (the model, the tool names and the redacted instructions), the active rules, and the host name and process id.
- Up to 10,000 events wait in memory. A full buffer drops the oldest allow decisions first. Events sent more than 30 seconds after they happened, or after a failed try, are marked `degraded`.
- The last events go out when Node empties its event loop (`beforeExit`). `process.exit()` skips that and loses them, and there is no public flush call, so let the process end on its own.
- A wrong agent key or URL makes `webhook` refuse batches with a 4xx status. The SDK drops those events and warns once per status, such as `Quard: webhook refused events (401). Check the agent key and the webhook URL.`
- The backend deletes a run 30 days after its last event by default, and a run tied to an incident a year after the incident opened.

## When the backend is down

Guards run inside the app, so most of Quard keeps working when `webhook` or `control` can't be reached:

| Part                                                | While the backend is down                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rules, labels, value tracing, per-run limits, scans | Work as usual                                                                                   |
| Approvals with an `approver` in code                | Work as usual                                                                                   |
| Approvals through the dashboard                     | Wait up to 30 seconds for `control` to take the request, then refuse with `backend_unavailable` |
| Per-day limits                                      | Count in the process from the last totals `control` sent, block at the cap, and catch up later  |
| Fleet check                                         | Uses the last synced list of blocked values for up to 24 hours                                  |
| Messages and memory from another process            | Read as untrusted when their label records can't be found                                       |
| Detector                                            | Works, since the app calls it directly                                                          |
| Events                                              | Wait in memory and are retried every 1 to 60 seconds                                            |

- With no `approver` and no control link at all, approval guards refuse at once with `approval_unavailable`. Set an `approver` when the app runs without the backend.
- Decide what the app does with a `backend_unavailable` refusal, such as putting the task back in a queue. During an outage each process counts per-day limits on its own, so several processes together can pass a daily cap.
- The control link reconnects by itself. If `control` refuses the agent key, the SDK warns once on the console and keeps trying.

## Testing

- Leave `key` and the URLs out of tests, so nothing uploads and no socket opens. Guards work the same.
- Give the OpenAI client a fake `fetch` and wrap it as usual. `quard.wrap()` keeps the client's own `fetch`, so every Responses call still goes through Quard.
- Collect events with `onEvent` and check the `decision` events: `guard`, `rule`, `decision`, `mode` and `reason`.
- Run each test task inside `quard.run()`. Guarded calls outside a run each start a run of their own, so per-run limits never add up there.
- Answer approvals with an `approver`, such as `async () => "deny"`, so no test waits for a person. To see a run limit refuse a model call, set `runLimits: { mode: "block", steps: 1 }`: the second model call in a run then throws.
- Quard keeps its settings, `"always"` answers and per-day counts in module state for the whole process. Vitest and Jest load each test file fresh, but tests in one file share that state.

```ts
import assert from "node:assert/strict";
import OpenAI from "openai";
import { guard, isGuardRefusal, quard, type RunEvent } from "quard";

const events: RunEvent[] = [];
quard.configure({ onEvent: (event) => events.push(event) });

// A fake model: every Responses API call gets the same empty reply
const fakeModel = async () => Response.json({ id: "resp_1", object: "response", status: "completed", output: [] });
const client = quard.wrap(new OpenAI({ apiKey: "test", fetch: fakeModel, maxRetries: 0 }));

const sendEmail = guard(async (input: { to: string }) => `sent to ${input.to}`, {
    type: "limit",
    name: "sendEmail",
    maxCallsPerRun: 1,
});

await quard.run({ agent: "test" }, async () => {
    await client.responses.create({ model: "gpt-5.4-mini", input: "Email the team." });
    assert.equal(await sendEmail({ to: "a@acme.com" }), "sent to a@acme.com");
    const second = await sendEmail({ to: "b@acme.com" });
    assert.ok(isGuardRefusal(second));
    assert.equal(second.reason, "limit_reached");
});

const blocks = events.filter((event) => event.type === "decision" && event.decision === "block");
assert.equal(blocks.length, 1);
```

## More

- [Self-host Quard](https://github.com/oynozan/quard/blob/main/docs/content/self-host.mdx) and [Retention](https://github.com/oynozan/quard/blob/main/docs/content/concepts/retention.mdx): the backend, and how long it keeps data.
- [Configuration](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/configure.mdx) and [Events](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/events.mdx): the full SDK reference.
- [`core/config.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/core/config.ts) and [`transport/configure.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/transport/configure.ts): the options, and when the connections start.
- [`sandbox/13-backend-down.ts`](https://github.com/oynozan/quard/blob/main/sandbox/13-backend-down.ts): guards with the backend unreachable.
