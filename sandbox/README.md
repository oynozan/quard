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

2. Start the local backend and the dashboard:

    ```sh
    node sandbox/dashboard.ts
    ```

    It uses the database in `web/.env` (`DATABASE_URL`), applies migrations, and runs webhook (port 4100), control (4200) and the web app (3000). Ctrl-C stops it all.

3. Open http://localhost:3000, sign in, then go to Settings and create an agent key. Add it to `sandbox/.env`:

    ```sh
    QUARD_AGENT_KEY=qk_live_...
    ```

4. In another terminal:

    ```sh
    node sandbox/15-everything.ts
    ```

No Postgres? Run `pnpm --filter @quard/db dev:db` and set `DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres` in `web/.env`. Only one Next dev server can run in `web/` at a time, so stop any other one first.

With `QUARD_AGENT_KEY` set, every example sends its runs to the dashboard, and `05-human-approval.ts` waits for your answer at http://localhost:3000/approvals instead of asking in the terminal. Comment the line out to keep runs in the terminal only.

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

| File                               | What it shows                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `09-runs-in-the-dashboard.ts`      | Runs reach the dashboard with secrets removed and IBANs and emails masked; completed, failed and blocked runs   |
| `10-approvals-in-the-dashboard.ts` | Approvals answered in the dashboard: always approve, an amount rule that asks, a timeout                        |
| `11-daily-limits.ts`               | Per-day limits shared by every process; run it twice and the count goes on                                      |
| `12-fleet-check.ts`                | A new IBAN paid in 5 separate runs is quarantined (only observed for the first 7 days)                          |
| `15-everything.ts`                 | All of it in one go: every guard type, several agents, an approval to click, completed, failed and blocked runs |

These run with or without it:

| File                              | What it shows                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `13-backend-down.ts`              | Backend unreachable: approvals block after 30 s, daily limits count locally, other guards keep working |
| `14-policy-file.ts`               | Rules in a JSON policy file win over code and change while the app runs                                |
| `16-your-own-rules.ts`            | Custom check rules, neverSeen that blocks, a per-run amount cap, block beats ask                       |

## How it fits together

- `import { guard, quard } from "quard"` is the same line an app would use. `pnpm install` links `node_modules/quard` to `lib/quard`, which re-exports the SDK source in `packages/sdk`, so SDK changes show up right away.
- The sandbox is a workspace package (`@quard/sandbox`), so CI type-checks the examples.
- `lib/agent.ts` is a plain agent loop on the Responses API, and `lib/tools.ts` holds the tool definitions the model sees.
- `dashboard.ts` and `lib/backend/` start the local backend.
- `lib/env.ts` loads `.env`, `lib/terminal.ts` asks for approvals, and `lib/show.ts` prints events.
