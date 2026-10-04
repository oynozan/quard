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

1. Add a hash key to `sandbox/.env`. Make one with `openssl rand -hex 32`:

    ```sh
    QUARD_HASH_KEY=<64 hex characters>
    ```

    Put the same key in `web/.env`.

2. Start webhook and control, each in its own terminal:

    ```sh
    node --env-file=web/.env services/webhook/main.ts    # port 4100
    node --env-file=web/.env services/control/main.ts    # port 4200
    ```

3. Open the dashboard at http://localhost:3100, sign in, then go to Settings and create an agent key. Add it to `sandbox/.env`:

    ```sh
    QUARD_AGENT_KEY=qk_live_...
    ```

4. In another terminal:

    ```sh
    node sandbox/15-everything.ts
    ```

No Postgres? Run `pnpm --filter @quard/db dev:db` and set `DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres` in `web/.env`.

With `QUARD_AGENT_KEY` set, every example sends its runs to the dashboard, and `05-human-approval.ts` waits for your answer at http://localhost:3100/approvals instead of asking in the terminal. Comment the line out to keep runs in the terminal only.

## Examples

| File                           | What it shows                                                     |
| ------------------------------ | ----------------------------------------------------------------- |
| `01-first-guard.ts`            | `guard()`, a limit, how the model reacts, `onBlock: "throw"`      |
| `02-where-values-come-from.ts` | Labels; an IBAN from our records is paid, one from the web is not |
| `03-hidden-instructions.ts`    | The source guard: flag, strip or block a poisoned page            |
| `04-where-data-can-go.ts`      | The egress guard: allow lists and untrusted destinations          |
| `05-human-approval.ts`         | You approve payments: once, always or deny                        |
| `06-observe-mode.ts`           | Rules that record but never block                                 |
| `07-agents-and-permissions.ts` | `quard.run()`, `quard.agent()` and tool permissions               |
| `08-what-quard-records.ts`     | The full timeline of a run                                        |

These need the local backend (see "See runs in the dashboard"):

| File                               | What it shows                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `09-runs-in-the-dashboard.ts`      | Runs reach the dashboard with secrets removed and IBANs and emails masked; completed, failed and blocked runs      |
| `10-approvals-in-the-dashboard.ts` | Approvals answered in the dashboard: always approve, an amount rule that asks, a timeout                           |
| `11-daily-limits.ts`               | Per-day limits shared by every process; run it twice and the count goes on                                         |
| `12-fleet-check.ts`                | A new IBAN paid in 5 separate runs is quarantined (only observed for the first 7 days)                             |
| `15-everything.ts`                 | All of it in one go: every guard type, several agents, an approval to click, completed, failed and blocked runs    |
| `22-agents-in-two-processes.ts`    | A billing agent in a second process gets the run and its labels in a baggage header; the web IBAN is blocked there |

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

## How it fits together

- `import { guard, quard } from "quard"` is the same line an app would use. `pnpm install` links `node_modules/quard` to `lib/quard`, which re-exports the SDK source in `packages/sdk`, so SDK changes show up right away. `quard/openai-agents` works the same way.
- The sandbox is a workspace package (`@quard/sandbox`), so CI type-checks the examples.
- `lib/agent.ts` is a plain agent loop on the Responses API, and `lib/tools.ts` holds the tool definitions the model sees.
- `lib/env.ts` loads `.env`, `lib/terminal.ts` asks for approvals, and `lib/show.ts` prints events.
