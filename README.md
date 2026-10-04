# Quard

Quard watches AI agents while they work. It records every model call, stops dangerous tool calls before they run, and finds which step and which agent caused an incident.

## Run the sandbox

You need Node 24 and an OpenAI API key.

```sh
npm install -g pnpm@12.6.0
pnpm install
cp sandbox/.env.example sandbox/.env    # then put your OpenAI key in it
node sandbox/playground/run.ts
```

It tells a short story and asks what the agent should do. Type anything: a real agent, guarded by Quard, runs it and prints each step, what Quard detected and how long its checks took.

Its settings are three files in [sandbox/playground/](sandbox/playground). Change them and run again:

- `scenario.json`: the prompt, the system prompt, the email and web page the agent reads, the model and its tools
- `policy.json`: the rules. Remove a guard, switch one to observe mode, change a limit or a threshold.
- `signatures.json`: the feed of known-bad patterns

A change to `policy.json` or `signatures.json` applies from the next guarded tool call, even during a run. `git checkout sandbox/playground` puts the defaults back.

### See runs and incidents in the dashboard

Make one hash key for every process:

```sh
KEY=$(openssl rand -hex 32)
printf 'DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres\nQUARD_HASH_KEY=%s\nQUARD_SKIP_SIGN_IN=1\n' "$KEY" > web/.env.local
printf 'QUARD_HASH_KEY=%s\n' "$KEY" >> sandbox/.env
```

Then start each of these in its own terminal:

```sh
pnpm --filter @quard/db dev:db                                                  # Postgres, port 5432
pnpm --filter web dev                                                           # dashboard, http://localhost:3100
node --env-file=web/.env.local services/webhook/main.ts                         # port 4100
node --env-file=web/.env.local services/control/main.ts                         # port 4200
node --env-file=web/.env.local --env-file=sandbox/.env services/worker/main.ts  # finds each incident's cause
```

In the dashboard, open **Settings**, create an agent key and add it to `sandbox/.env` as `QUARD_AGENT_KEY=qk_live_...`. Run the sandbox again: the run shows under **Runs**, and anything Quard blocked or flagged opens an incident under **Incidents**.

## Run the tests

```sh
pnpm test
```

## Learn more

- [PROJECT.md](PROJECT.md): how Quard works and every design decision
- [sandbox/README.md](sandbox/README.md): more runnable examples, one per feature
- [docs/content](docs/content): the user guide (`pnpm --filter docs dev`, then http://localhost:3001)
