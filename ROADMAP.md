# Quard v1 roadmap

Eight milestones, in order. Each one ends with something that runs, with 100% test coverage. The details are in [PROJECT.md](PROJECT.md).

## Start now

Milestones 0 and 1 need no more decisions.

## M0. Workspace

- A root pnpm workspace with `packages/shared`, `packages/sdk`, `services/webhook`, `services/control`, `services/worker` and `web`.
- Move `web/.prettierrc` and the settings in `web/pnpm-workspace.yaml` to the root. Add a shared `tsconfig` and pin TypeScript 5.9 or 6.x.
- Vitest in every package, with a 100% coverage gate. A Hono health route in `webhook` and `control`.
- A `docker-compose.yml` with Postgres 18, and a small script that runs `db/migrations` in order.
- CI: format check, lint, type check and tests.

**Done when** `pnpm test` passes at 100% coverage, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass, and `docker compose up` starts Postgres and both services.

## M1. SDK core, no backend

- `packages/shared`: label types, value normalizers (IBAN, email, URL, domain, file path), refusal templates and event schemas.
- `quard.wrap(client)`: a fetch hook for the Responses API, streams included. The event that completes a tool call is held until the call is checked. A call that fails its check is marked blocked, and the guarded tool refuses it.
- Run context: `quard.run()` and `quard.agent()`.
- The content index, context labels and value labels: exact, normalized and inside longer text.
- The `guard()` pipeline with `source` (pattern scans), `action`, `egress` and `limit` (per-run counts). Refusals, `onBlock: "throw"` and observe mode.
- Tests against a mocked OpenAI server.

**Done when** a test agent reads a web page that holds an IBAN, tries to pay it, and `guard()` blocks the payment with a refusal the model reads.

## M2. Events reach the dashboard

- First migrations: projects, agent keys, runs, steps, events, labels and decisions.
- Redaction in the SDK before upload: secrets removed, and keyed hashes with masks for IBANs, card numbers and emails.
- The SDK uploads events to `webhook` in batches. `webhook` checks the agent key and the schemas, then writes to Postgres.
- `web`: Privy sign-in (email code or GitHub), a run list and a run timeline colored by labels.

**Done when** a test agent's run shows up in the dashboard, and no secret or raw IBAN is stored.

## M3. Control and approvals

- `control`: SDK connect (agents, versions, rule names and hashes), per-day and fleet counters, the quarantine list and revocation.
- The `approval` guard: pause and wait, heartbeats, approve once, always approve and deny. Block checks run again after an approval.
- `web`: the approvals page and the list of "always" approvals. Decisions reach `control` through Postgres `LISTEN/NOTIFY`.
- The backend-down rules from Q23, and the fleet check, in observe mode for its first 7 days.

**Done when** a `payInvoice` call waits, an approver approves it in the dashboard, and the tool runs with exactly the approved arguments.

## M4. Multi-agent

- A guarded send function and a receive function with a `source` guard.
- `quard.inject()` and `quard.resume()`. Label records are stored before a message leaves, and looked up through `control`.
- Delegated permissions, and run limits in observe mode.
- The shared-memory wrapper.
- The OpenAI Agents SDK (JS) integration.
- `web`: the agent graph view.

**Done when** an orchestrator in one process delegates to an agent in another, and a web-derived IBAN in the brief is blocked in the second agent's payment.

## M5. x402 payments

- `packages/shared`: x402 header schemas (v1 and v2), wallet addresses as a value kind, a stablecoin list and the `payment` event.
- The `x402` guard: `quard.x402(client, options)` checks every payment before it is signed, with payment limits, host lists, untrusted origins and the payee fleet check. It asks a person only above `approveAbove`.
- `quard.x402Fetch(fetch)` reads every x402 response: price requests, payments, settlements, and whether the paid response arrived.
- `control`: per-day spend and the payee fleet check. `webhook` and `db`: payment steps and spend per run.
- `web`: payments in the run view, spend columns and spend on the Summary page.
- x402 over MCP, docs and two sandbox examples.

**Done when** a poisoned page sends an agent to a paid endpoint and the payment is refused before signing with a refusal the model reads. Also, ten paid calls in a loop stop at the run cap, and each one shows in the run view with amount, payee and settlement. The details are in [PROJECT.md](PROJECT.md#payments-x402).

## M6. Root-cause finder

- `worker` jobs on pg-boss: value tracing, the verdict, replay (rounds of 5, early stop, $5 cap) and the AI reviewer, using the team's own key.
- `web`: the incident view with a replay button, search across runs by hashed value, and the summary view.

**Done when** the M1 payment attack produces a verdict with entry point, turning point, damage and missing guard, confirmed by replay.

## M7. Ship v1

- The Jev detector in observe mode, behind the detector interface.
- Hosted web search (URL level, recorded as `unscanned`) and hosted MCP approval requests.
- The retention cleanup job.
- Docker images, one compose file for self-hosting, and install docs.

**Done when** a new team can install Quard from the docs and see their first guarded run.
