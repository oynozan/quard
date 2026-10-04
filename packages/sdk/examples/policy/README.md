# Quard policy file

One JSON file holds the guard rules, so operators can change them while agents run. [quard.policy.json](quard.policy.json) is a working example.

```ts
quard.configure({ policyFile: "./quard.policy.json" });
```

## How changes apply

- Before a guarded call, Quard rereads the file if at least 1 second has passed since the last check. A change applies from the next call. No restart is needed.
- A valid new version replaces the old one as a whole.
- An invalid version is ignored. The last good version stays in force, and a `config_error` event says what is wrong. Each broken version is reported once.
- At startup, `configure()` throws if the file is missing or invalid, so the problem shows up at once.
- Every decision event carries `policy`, the version of the file in force.

The file has a [JSON Schema](quard.policy.schema.json). Editors such as VS Code use it through `$schema` to check fields as you type. After a schema change in code, run `pnpm --filter quard schemas` to update the file.

## Fields

| Field        | What it does                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`    | Any string or number. It is copied into every decision event.                                                                                                                                                 |
| `strictness` | `lenient`, `balanced` (the default) or `strict`. Sets the defaults below.                                                                                                                                     |
| `origins`    | Trust and sensitivity for exact origins, such as `"mcp:crm.acme.internal"`. These win over the `origins` set in code.                                                                                        |
| `guards`     | Tool name to a list of guard options. A tool listed here ignores its options in code. An empty list removes every check, and calls are still recorded. Tools not listed keep their code options.          |
| `signatures` | The attack signature feed: `file` or `url`, `refreshSeconds` and `mode`. See [Signature feed](#signature-feed).                                                                                               |
| `detector`   | `mode` (`observe` or `enforce`), `flagAt` and `stripAt`, from 0 to 1. The detector itself is set in code with `configure({ detector })`. See [AI detector](#ai-detector).                                     |

## Strictness presets

| Preset     | Suspect content from a source | Secrets sent out | Card numbers sent out | IBANs sent out |
| ---------- | ----------------------------- | ---------------- | --------------------- | -------------- |
| `lenient`  | flag                          | mask             | mask                  | allow          |
| `balanced` | flag                          | block            | mask                  | allow          |
| `strict`   | block                         | block            | block                 | mask           |

A guard's own options win over the preset: `onSuspect` on a source guard, `payload` on an egress guard. Without a policy file, `balanced` applies.

## Guard options

Every type except `approval` takes `mode`: `"block"` (the default) enforces, and `"observe"` records what would happen and lets the call run. Any option may set `onBlock: "throw"` to throw `GuardBlockedError` instead of returning a refusal.

| Type       | Options in the file                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`   | `origin` (`web`, `email`, `mcp`, `file` or a full origin such as `mcp:crm`), `blockDomains` and `allowDomains` (`evil.com` or `*.evil.com`), `onSuspect` (`flag`, `strip` or `block`).                 |
| `action`   | `rules`, each with `onFail` (`block` by default, or `ask`): `{ field, from: [origins] }`, `{ field, max }` or `{ field, neverSeen: true }`.                                                              |
| `approval` | `timeout`: seconds to wait for an answer, then refuse with `approval_timed_out`. No limit by default. Always asks a person.                                                                              |
| `egress`   | `allow` (`acme.com`, `*.acme.com` or `bob@acme.com`), `onFail` for internal data headed outside the allowlist, and `payload` with `secrets`, `cards` and `ibans` set to `allow`, `mask` or `block`. |
| `limit`    | `maxCallsPerRun` and `maxAmountPerRun: { field, max }` per run. `maxCallsPerDay` and `maxAmountPerDay: { field, max }` per UTC day, across every process of the project. `fleetCheck`: the fields whose IBANs, emails and domains the fleet check watches. |

Options that are functions in code (`originOf`, `destinations` and custom rules with `check`) can't be written in the file.

Per-day limits and the fleet check need the link to control (`controlUrl` with `key`). Without it, per-day limits count in the process only, and the fleet check does nothing.

## Sensitive data sent out

An egress guard looks for secrets (API keys, tokens and private keys), card numbers (13 to 19 digits that pass the Luhn check) and IBANs (that pass the mod-97 check) in the data a tool would send.

- `block` refuses the call.
- `mask` replaces the value before the checks, the approval and the tool see it, for example `•••• 4242`, `DE89…3000` or `[secret removed by Quard]`. A value that can't be masked, such as a card number passed as a number, is blocked instead.
- `allow` lets it through. The decision event still names the kind found.

## Signature feed

The feed is a JSON list of known attack patterns. [signatures.json](../signatures/signatures.json) is the starter feed, and [signatures.schema.json](../signatures/signatures.schema.json) is its schema.

- `file` is reread before calls, like the policy file. A relative `file` is read from the policy file's folder.
- `url` is downloaded in the background at startup and then every `refreshSeconds` (300 by default), with an ETag. Guarded calls wait for the first download.
- Quard fails closed: until one download of a `url` feed works, every guarded call is blocked with the reason `signatures_unavailable`, and a `config_error` event says why. While calls come in, Quard tries the download again at most every 5 seconds. In `observe` mode the missing feed is only recorded.
- `file`, `url` and `refreshSeconds` are read at startup. `mode` applies live: `block` acts on matches, and `observe` only records them.
- Once a version has loaded, a failed or invalid update keeps that version in use, so calls are still checked against it, and records a `config_error` event.

Each signature has an `id`, a `title`, a `category`, `where` (`input` for tool arguments, `content` for what a source tool returns), optional `tools`, the strings to look for and an `action`:

- It matches when the text holds every `all` string, at least one `any` string and no `none` string.
- Before matching, both sides lose case, spaces and invisible characters, and full-width letters become plain ones.
- On tool input, `block` stops the call and `flag` asks a person. On content, `block` withholds it and `flag` marks it, so the agent's later actions face stricter rules.
- Patterns are plain strings, not regular expressions, so a bad feed can't freeze the process.

## AI detector

A detector is an object with a `name` and a `label(text, { signal })` function. It picks one label from a fixed list for the text, and gives the chance of each label, from 0 to 1. It can also give `injection`: the chance that some part of the text tries to instruct the AI agent reading it. Quard comes with Jev from TypeSafe, pinned to `jev-1.13.0`. It is off, and nothing is labeled, until you set it in code with a TypeSafe API key:

```ts
import { jevDetector, quard } from "quard";

quard.configure({ detector: jevDetector({ apiKey: process.env.TYPESAFE_API_KEY ?? "" }) });
```

What is sent:

- Only content labeled `public` goes to the detector. Web pages, email and MCP results are public by default, intranet hosts included. Mark your own servers and hosts `sensitivity: "internal"` under `origins` to keep them away from it.
- Every `email:` origin is public, so a colleague's mail read by an inbox tool goes to the detector too. The origin comes from the tool's arguments, such as `email:readInbox`, not from the sender. Marking it internal, as in `"email:readInbox": { "sensitivity": "internal" }`, keeps all its mail away from the detector, outside mail included.
- Secrets are removed, and emails, IBANs and card numbers are masked first. Values of fields named like secrets, such as `password` or `client_secret`, are never sent, also when the JSON arrives as text, as most MCP results do. Names, street addresses and phone numbers are sent as written.
- Short values, and keys that read like text, are packed together, and bare numbers are skipped, so a wide JSON result takes a few requests. A long text is cut into chunks of up to 4,000 characters at line breaks, sentence ends or spaces, never inside an IBAN, card number, email or secret. Chunks cut from one paragraph overlap a little.
- Jev answers two questions about each chunk in one request: which label fits, and whether any part of it tries to instruct the AI agent reading it.

What it does:

- `enforce` (the default) waits up to 5 seconds in total, with at most 8 requests in flight per process. A busy or unreachable API gets one retry, unless its `Retry-After` asks for more than 1.5 seconds or the 5 seconds run out.
- A chunk is removed when the yes or no answer, or its `prompt_injection` chance, reaches `stripAt` (0.9). The whole chunk goes, ordinary text in it included, and the agent is not told. A key can't be removed, so a key that holds an injection only flags the content `detector:prompt_injection`.
- A chunk whose risky labels add up to `flagAt` (0.5) flags the content, such as `detector:payment_fraud`, so the agent's later actions face stricter rules. The flag names the most likely risky label.
- A chunk that fails, answers late or can't reach the API is unchecked. `enforce` still acts on the chunks that answered, and flags the content `detector:unchecked`. Like any flag, it only counts in `action` rules: a value from it fails `from` rules, which block by default, and makes `neverSeen` rules ask a person. Egress guards and `max` rules don't read flags. A `detector_error` warning gives the reason, such as `http_401`, `http_429`, `timeout` or `bad_reply`. A refused key or another model version is also logged once.
- `observe` does not wait and changes nothing. It records what `enforce` would do. Set it with `detectorRules: { mode: "observe" }` to check the labels first.
- The detector only tightens: it can flag or remove content, never allow what a rule blocked.

What is recorded:

- Each result is a decision event: `score` is the highest risk of any chunk, and `reason` lists the labels the detector gave, plus `unchecked` when a chunk failed.
- Each answered chunk is a `chunk_label` event: the redacted text the detector saw, the origin of its content, its label, the chance of each label, its `score` and, from Jev, its `injection` answer. They are kept with the run, so people can check the labels.

The labels, with what each one means, are in [labels.ts](../../detectors/labels.ts):

- Risky: `prompt_injection`, `payment_fraud`, `phishing` and `malicious_code`.
- Not risky: `invoice`, `business_message`, `promotion`, `documentation`, `article`, `search_results`, `code` and `data_records`.
- `none` when no other label fits.
