# Sandbox

Small, runnable examples of the Quard SDK with a real OpenAI model. Change anything; `sandbox/.env` holds your keys and is never committed.

## Setup

Run `pnpm install` at the repo root, then copy `sandbox/.env.example` to `sandbox/.env` and put your OpenAI API key in it:

```sh
OPENAI_API_KEY=sk-...
```

The examples use `gpt-5.4-mini`. Set `OPENAI_MODEL` in the same file to use another model.

## Run

From the repo root:

```sh
node sandbox/01-first-guard.ts
```

All of them:

```sh
for f in sandbox/[0-9]*.ts; do echo "== $f"; node "$f"; done
```

A real model decides what to do, so the wording and sometimes the steps change from run to run. Each example makes a handful of API calls. Example 05 asks you to approve payments in the terminal.

Nothing checks the examples automatically, and the SDK doesn't reject unknown options. After changing the SDK, type-check them:

```sh
pnpm --filter @quard/sandbox typecheck
```

## See runs in the dashboard

The examples play the part of your app. Three backend services work with the dashboard you already run at http://localhost:3100: webhook stores the runs, control answers approvals and limits, and the worker finds the root cause of each incident. Each runs in its own terminal.

1. Make a hash key with `openssl rand -hex 32` and add it to `web/.env`, next to `DATABASE_URL`. Restart the dashboard so it reads the key; search needs it.

    ```sh
    QUARD_HASH_KEY=<64 hex characters>
    ```

    Only the servers use it. The examples get their project's key from the backend, with the agent key.

2. Start webhook (port 4100) in one terminal, from the repo root:

    ```sh
    node --env-file=web/.env services/webhook/main.ts
    ```

3. Start control (port 4200) in another:

    ```sh
    node --env-file=web/.env services/control/main.ts
    ```

    On a new database, run the migrations once first: `node --env-file=web/.env db/main.ts`.

4. Start the worker in a third terminal:

    ```sh
    node --env-file=web/.env --env-file=sandbox/.env services/worker/main.ts
    ```

    It finds each incident's root cause, and runs replay with the `OPENAI_API_KEY` from `sandbox/.env`. Without the worker, new incidents stay at "Finding the root cause".

5. In the dashboard, sign in, go to Settings and create an agent key.

6. Add the agent key and the same hash key to `sandbox/.env`, as a real app would:

    ```sh
    QUARD_AGENT_KEY=qk_live_...
    QUARD_HASH_KEY=<the same 64 hex characters as in web/.env>
    ```

7. Run the smallest example. It configures Quard and watches one model call, which then shows on the Runs page:

    ```sh
    node sandbox/minimal.ts
    ```

    To fill the dashboard, run `node sandbox/15-everything.ts`.

With `QUARD_AGENT_KEY` set, every example sends its runs to the dashboard, and `05-human-approval.ts` waits for your answer at http://localhost:3100/approvals instead of asking in the terminal. Comment the line out to keep runs in the terminal only.

## Check an install

`00-check-deploy.ts` checks an install in a few seconds: the dashboard, the docs, webhook, control, the live link, the worker and one real run. It exits with 1 when a check fails. The worker answers no requests, so control reports when it last checked in.

```sh
node sandbox/00-check-deploy.ts
```

It reads `sandbox/.env`, so it checks the local install. For a server, put its settings in `sandbox/.env.deploy`:

```sh
QUARD_AGENT_KEY=qk_live_...    # made in that dashboard
QUARD_DASHBOARD_URL=https://app.example.com
QUARD_DOCS_URL=https://docs.example.com
QUARD_WEBHOOK_URL=https://ingest.example.com
QUARD_CONTROL_URL=https://control.example.com
```

Then:

```sh
node --env-file=sandbox/.env.deploy sandbox/00-check-deploy.ts
```

## Playground

`playground/` runs one scenario you can edit, with the real SDK, the way an app would.

- `scenario.json`: the model, the system prompt, what the user asks, the email `readEmail` returns, the page `fetchPage` returns, the tools the model gets, and whether an AI detector checks untrusted content.
- `policy.json`: every guard rule, in the policy file format. A tool left out of `guards` has no rules; the feed still checks its arguments.
- `signatures.json`: the signature feed `policy.json` points at.

The defaults show an attack on the first run: an invoice email that hides instructions to pay another IBAN and send the customer list outside. `git checkout sandbox/playground` puts them back.

Run it once in the terminal:

```sh
node sandbox/playground/run.ts
```

In a terminal it tells a short story and asks what the agent should do; without one, as in scripts, it uses the prompt in `scenario.json`. It then prints each step, what Quard detected, where the run went and how long Quard's checks took. The last line, `@result`, holds the same as JSON for scripts. Quard rereads `policy.json` and `signatures.json` before each guarded call, so an edit applies from the next guarded call. With `TYPESAFE_API_KEY` in `sandbox/.env` the detector is Jev; without it an OpenAI model scores the text, as in example 19.

With `QUARD_AGENT_KEY` and `QUARD_HASH_KEY` in `sandbox/.env` and the backend running (see "See runs in the dashboard"), the run shows up in the dashboard, and anything Quard blocked or flagged opens an incident.

The playground has tests, which need no API key: `pnpm --filter @quard/sandbox test`.

## Examples

| File                           | What it shows                                                     |
| ------------------------------ | ----------------------------------------------------------------- |
| `minimal.ts`                   | The smallest setup: configure Quard and watch one model call      |
| `01-first-guard.ts`            | `guard()`, a limit, how the model reacts, `onBlock: "throw"`      |
| `02-where-values-come-from.ts` | Labels; an IBAN from our records is paid, one from the web is not |
| `03-hidden-instructions.ts`    | The source guard: flag, strip or block a poisoned page            |
| `04-where-data-can-go.ts`      | The egress guard: allow lists and untrusted destinations          |
| `05-human-approval.ts`         | You approve payments: once, always or deny                        |
| `06-observe-mode.ts`           | Rules that record but never block                                 |
| `07-agents-and-permissions.ts` | `quard.run()`, `quard.agent()` and tool permissions               |
| `08-what-quard-records.ts`     | The full timeline of a run                                        |

These need the local backend (see "See runs in the dashboard"):

| File                                     | What it shows                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `09-runs-in-the-dashboard.ts`            | Runs reach the dashboard with secrets removed and IBANs and emails masked; completed, failed and blocked runs                         |
| `10-approvals-in-the-dashboard.ts`       | Approvals answered in the dashboard: always approve, an amount rule that asks, a timeout                                              |
| `11-daily-limits.ts`                     | Per-day limits shared by every process; run it twice and the count goes on                                                            |
| `12-fleet-check.ts`                      | A new IBAN paid in 5 separate runs is quarantined (only observed for the first 7 days)                                                |
| `15-everything.ts`                       | All of it in one go: every guard type, several agents, an approval to click, completed, failed and blocked runs                       |
| `22-agents-in-two-processes.ts`          | A billing agent in a second process gets the run and its labels in a baggage header; the web IBAN is blocked there                    |
| `sim/29-poisoned-handoff-protected.ts`   | Three agents fix a build; a web page poisons a handoff, and the Engineer's shell is blocked because the context is untrusted          |
| `sim/28-poisoned-handoff-unprotected.ts` | The same three agents, watched but the shell guard only observes: the breach runs, the canary leaks, and the run opens as an incident |

These run with or without it:

| File                              | What it shows                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `13-backend-down.ts`              | Backend unreachable: approvals block after 30 s, daily limits count locally, other guards keep working          |
| `14-policy-file.ts`               | Rules in a JSON policy file win over code and change while the app runs                                         |
| `16-your-own-rules.ts`            | Custom check rules, neverSeen that blocks, a per-run amount cap, block beats ask                                |
| `17-sensitive-data-going-out.ts`  | Egress payload rules (mask, block, allow), strictness presets, `destinations`, `onFail: "ask"`                  |
| `18-origins-and-trust.ts`         | Full origins, `from` versus trust, origin overrides, `originOf` and `allowDomains`                              |
| `19-ai-detector.ts`               | An AI detector catches a reworded attack the built-in checks miss: observe, enforce, tuning                     |
| `20-signature-feeds.ts`           | Known-bad patterns from a file or URL: block, observe, updates without a restart                                |
| `21-streaming-and-model-calls.ts` | Streamed answers and tool calls, tokens and cost, agent versions, unrecorded Chat Completions                   |
| `23-shared-memory.ts`             | `quard.memory()`: a web IBAN in a saved note is blocked in a later run, and so is a note edited behind its back |
| `24-openai-agents-sdk.ts`         | The OpenAI Agents SDK with `quardRunner()` and `guardedTool()`; the web IBAN is blocked after a handoff         |
| `25-run-limits.ts`                | Run limits on turns between two agents and on model calls, first observed, then enforced                        |
| `26-paid-link-in-a-page.ts`       | The x402 guard refuses to pay a host found in a web page, before signing; the model reads the refusal           |
| `27-paid-api-in-a-loop.ts`        | A paid API called in a loop stops at the run cap, with each payment and settlement printed; no API key needed   |

## The attack simulation (`sandbox/sim`)

A filmable before/after: three agents (Researcher, Lead, Engineer) fix a failing build, and a web page the Researcher reads hides an instruction to upload the project's `.env`. `sim/task.png` (source `sim/task.html`, rendered at 1080×720 with headless Chrome) shows what the team is meant to do.

- `sim/28-poisoned-handoff-unprotected.ts` — Quard watches but the shell guard only observes: the Engineer runs the planted command, the canary `.env` leaks to a local collector, and the run opens as an incident.
- `sim/29-poisoned-handoff-protected.ts` — the same handoff, guarded: the web label travels across both handoffs, so the Engineer's shell is blocked and nothing leaks.

Everything is real: a real model, three real processes, two real local servers, and a real shell confined by `sandbox-exec` to a throwaway folder (canary values only) and localhost. Both need the local backend.

## How it fits together

- `import { guard, quard } from "quard"` is the same line an app would use. `pnpm install` links `node_modules/quard` to `lib/quard`, which re-exports the SDK source in `packages/sdk`, so SDK changes show up right away. `quard/openai-agents` works the same way.
- The sandbox is a workspace package (`@quard/sandbox`), so CI type-checks the examples.
- `lib/agent.ts` is a plain agent loop on the Responses API, and `lib/tools.ts` holds the tool definitions the model sees.
- `lib/x402/` holds a local x402 server with a stub facilitator and a fake signer, so the payment examples need no chain or wallet.
- `lib/env.ts` loads `.env`, `lib/terminal.ts` asks for approvals, and `lib/show.ts` prints events.
- `playground/` holds the runner (`run.ts`), the service (`server.ts`, with `service/`) and the default files. `test/` has a fake OpenAI server that scripts the model's tool calls.
