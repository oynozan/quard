# Policy file, origins, detector and signatures

How to keep guard rules in a JSON policy file that applies while the app runs, change the trust of one origin, turn on the AI detector, and load a feed of known attack signatures.

## Contents

- [The policy file](#the-policy-file)
- [Origin overrides](#origin-overrides)
- [The AI detector](#the-ai-detector)
- [Signature feeds](#signature-feeds)

## The policy file

A policy file is one JSON file of guard rules and settings. Quard rereads it while the app runs, so a team can tune a rule, try it in observe mode, where it only records what it would do, or switch it on without a redeploy. What it sets wins over the code.

```ts
import { fileURLToPath } from "node:url";
import { quard } from "quard";

// A relative path is read from the working directory, so build it from this file's location
quard.configure({ policyFile: fileURLToPath(new URL("../quard.policy.json", import.meta.url)) });
```

- Keep the file in the repo next to the code that loads it, and review its changes like code.
- `configure()` reads it at once and throws if it is missing or invalid, so a broken file fails at startup.
- For checks in the editor, copy [quard.policy.schema.json](https://github.com/oynozan/quard/blob/main/packages/sdk/examples/policy/quard.policy.schema.json) next to the file and point `$schema` at it. The repo's [quard.policy.json](https://github.com/oynozan/quard/blob/main/packages/sdk/examples/policy/quard.policy.json) is a working example.

```json
{
    "$schema": "./quard.policy.schema.json",
    "version": 1,
    "strictness": "balanced",
    "origins": { "mcp:crm.acme.internal": { "trust": "trusted", "sensitivity": "internal" } },
    "runLimits": { "mode": "block", "steps": 100, "costUsd": 2 },
    "detector": { "mode": "observe" },
    "signatures": { "file": "./signatures.json", "mode": "block" },
    "guards": {
        "fetchPage": [{ "type": "source", "origin": "web", "blockDomains": ["*.evil-pages.net"] }],
        "sendEmail": [
            { "type": "egress", "allow": ["*.acme.com"], "payload": { "cards": "mask" } },
            { "type": "limit", "maxCallsPerRun": 5 }
        ],
        "payInvoice": [
            { "type": "action", "mode": "observe", "rules": [{ "field": "iban", "from": ["tool:getSupplier"] }] },
            { "type": "limit", "maxAmountPerDay": { "field": "amount", "max": 200000 }, "fleetCheck": ["iban"] }
        ],
        "deleteRecords": [{ "type": "approval", "timeout": 600 }]
    }
}
```

| Field | What it holds |
| --- | --- |
| `version` | Required, a non-empty string or a number. Decision events record it as `policy`, so change it on every edit |
| `strictness` | `"lenient"`, `"balanced"` (the default) or `"strict"`. Sets defaults for source and egress guards, see the presets below |
| `origins` | Trust and sensitivity for exact origins, as in [Origin overrides](#origin-overrides) |
| `guards` | Tool names, each with a list of guard options |
| `runLimits` | Any of `mode`, `depth`, `fanOut`, `loops`, `steps` and `costUsd`, see [guards.md](guards.md#run-limits) |
| `detector` | Any of `mode`, `flagAt` and `stripAt`, see [The AI detector](#the-ai-detector) |
| `signatures` | A feed: `file` or `url`, `refreshSeconds` and `mode`, see [Signature feeds](#signature-feeds) |
| `$schema` | The path of the JSON Schema, for editors. Quard ignores it |

Any other field is an error, and so is an unknown option inside a guard.

How the file wins over code:

- A tool listed under `guards` uses the file's list in place of all its options in code. A tool not listed keeps its code options. An empty list removes every guard, though the permission check and the signature feed still apply.
- The file can only guard a tool that has `guard()` in code, under the same `name`. Keys can also name a hosted tool, such as `web_search` (see [openai.md](openai.md)), or an x402 guard (see [payments.md](payments.md)).
- JSON can't hold functions: `originOf`, `carrierOf`, `destinations` and custom `check` rules. Listing a tool drops them, so leave tools that need them out of the file.
- `origins` replace code entries origin by origin. `runLimits` and `detector` win field by field. The file's `signatures` feed replaces the one set in code.

| Type | Options in the file |
| --- | --- |
| `source` | `origin` (required), `blockDomains`, `allowDomains`, `onSuspect` |
| `action` | `rules`, at least one: `{ "field", "from" }`, `{ "field", "max" }` or `{ "field", "neverSeen": true }`, each with optional `onFail` and `name` |
| `approval` | `timeout`, in seconds, above 0 |
| `egress` | `allow`, `onFail`, `payload` |
| `limit` | `maxCallsPerRun` and `maxCallsPerDay` as whole numbers, `maxAmountPerRun`, `maxAmountPerDay`, `fleetCheck`, `delegateTo` |

Every entry needs `type` and may set `onBlock`. Every type but `approval` takes `mode`. `name` changes nothing here: the key names the tool.

| `strictness` | Source `onSuspect` | Egress `secrets` | Egress `cards` | Egress `ibans` |
| --- | --- | --- | --- | --- |
| `lenient` | `flag` | `mask` | `mask` | `allow` |
| `balanced` | `flag` | `block` | `mask` | `allow` |
| `strict` | `block` | `block` | `block` | `mask` |

A guard's own `onSuspect`, or a kind set in its `payload`, wins over the preset. Without a policy file, `balanced` applies.

How edits apply:

- Before each call to a tool wrapped with `guard()`, and each x402 payment, Quard rereads the file when at least a second has passed since the last check. A model call does not reread it.
- A valid version replaces the old one as a whole, from that call on. An invalid version is ignored: the last good one stays, and a `config_error` event with `source: "policy"` says what is wrong.
- `guards`, `strictness`, `origins`, `detector`, `runLimits`, `version` and `signatures.mode` apply live. The feed's `file`, `url` and `refreshSeconds` are read only when `configure()` opens the policy file.

To move a tool's rules into the file:

1. Keep its `guard()` in code with the same `name`.
2. Write all of its guards into its list, not only the one you change, since the list replaces them all.
3. Add `"mode": "observe"` to rules you have not tried on live traffic.
4. Change `version`, save, and watch for `config_error` events.

## Origin overrides

Quard labels everything the agent reads with an origin, such as `web:docs.acme.com` or `tool:getSupplier`, a trust, `trusted` or `untrusted`, and a sensitivity, `internal` or `public`. The origin's kind, the part before the first colon, sets the defaults:

| Kind | Content | Trust | Sensitivity |
| --- | --- | --- | --- |
| `user`, `system` | The user's messages; system and developer instructions | trusted | internal |
| `tool` | Results of tools with a guard other than a source guard | trusted | internal |
| `web`, `email`, `mcp` | Source guards with these kinds; hosted web search and hosted MCP | untrusted | public |
| `file`, `agent` | Source guards with these kinds; messages from other agents | untrusted | internal |
| any other, such as `unknown` | Tools without `guard()`; history Quard never saw | untrusted | internal |

Trust drives `neverSeen` rules and the egress guard's untrusted-destination check. Sensitivity drives the egress allowlist check and what the detector may read. `from` rules check the origin itself.

```ts
import { quard } from "quard";

quard.configure({
    origins: {
        // Our own MCP server only serves our CRM data
        "mcp:crm.acme.internal": { trust: "trusted", sensitivity: "internal" },
        // A public app: what users type is untrusted
        user: { trust: "untrusted" },
        // Keeps the mail this inbox tool reads away from the AI detector
        "email:readInbox": { sensitivity: "internal" },
    },
});
```

- Matching is exact: `"mcp:crm"` covers neither `"mcp:crm.acme.internal"` nor `"mcp"`. A part left out keeps the kind's default.
- `configure()` calls merge by origin. A later entry replaces the earlier entry for that origin as a whole, and `{}` undoes it.
- An override applies to content read after it is set. Each run records the overrides in force when it started.
- Trust only origins your team controls, such as your own MCP server or your own sites.

## The AI detector

A detector is an AI model that labels what a source tool returned, such as `article` or `prompt_injection`, with the chance of each label. It only makes things stricter: it can strip text and flag content, never allow what a rule blocked or raise trust. It is off until you set one.

```ts
import { jevDetector, quard } from "quard";

quard.configure({
    detector: jevDetector({ apiKey: process.env.TYPESAFE_API_KEY ?? "" }),
    // Records labels without acting on them. Remove it to enforce.
    detectorRules: { mode: "observe" },
});
```

`jevDetector()` asks Jev, a model from TypeSafe, pinned to `jev-1.13.0`. It throws a `TypeError` when `apiKey` is empty, so a missing key fails at startup.

| Rule | Type | Default | What it does |
| --- | --- | --- | --- |
| `mode` | `"enforce"` or `"observe"` | `"enforce"` | `enforce` waits for the labels and acts on them. `observe` records them without waiting and changes nothing |
| `flagAt` | number, 0 to 1 | `0.5` | A chunk whose risky labels add up to this flags the content `detector:<label>`, such as `detector:payment_fraud` |
| `stripAt` | number, 0 to 1 | `0.9` | A chunk whose prompt injection chance reaches this is removed before the model reads it |

Set them with `detectorRules` in code or `detector` in the policy file. The file wins rule by rule over code, and code over the defaults. A later `configure()` with `detectorRules` replaces the earlier value as a whole.

- It runs only on results of tools with a source guard, after the scan and the signature feed, when neither withheld the result. When that source guard is in observe mode, the detector only observes.
- Only content labeled `public` is sent: web, email and MCP by default. Mark your own hosts and servers `sensitivity: "internal"` to keep their data away from it.
- Text is redacted first: secrets are removed, emails, IBANs and card numbers are masked, and values under secret-named fields are left out. Names, addresses and phone numbers are sent as written.
- Text goes in chunks of up to 4,000 characters, at most 8 requests at a time per process. `enforce` waits up to 5 seconds in total.
- In `enforce`, a stripped chunk goes whole and the agent is not told. An injection in an object key, which can't be removed, flags the content `detector:prompt_injection`. A request that fails or answers late flags it `detector:unchecked`, and records a `detector_error` warning with the reason.
- A flag only changes action rules: a value seen only in flagged content fails `from` rules, and a value first seen there fails `neverSeen` rules. Egress guards, `max` rules and the x402 guard ignore flags. A custom rule can read `call.context.flagged`.
- Each result is recorded as a decision with `rule: "detector:<name>"` and the top risk as `score`, and each answered chunk as a `chunk_label` event, so people can check the labels.

Risky labels: `prompt_injection`, `payment_fraud`, `phishing` and `malicious_code`. Other labels: `invoice`, `business_message`, `promotion`, `documentation`, `article`, `search_results`, `code`, `data_records` and `none`.

Roll it out in observe mode, check its labels, then remove `mode` to enforce. Your own detector is an object with a `name` and a `label()` function:

```ts
import { DetectorError, quard, type Detector } from "quard";

const detector: Detector = {
    name: "my-detector",
    async label(text, options) {
        // injectionChance() stands for your own model call, through a client that quard.wrap() did not wrap
        const value = await injectionChance(text, options?.signal);
        if (!Number.isFinite(value)) {
            throw new DetectorError("bad_reply");
        }
        const chance = Math.min(1, Math.max(0, value));
        return {
            label: chance >= 0.5 ? "prompt_injection" : "article",
            probabilities: { prompt_injection: chance, article: 1 - chance },
            injection: chance,
        };
    },
};

quard.configure({ detector });
```

- An answer counts when every label in it is a known one, `label` has its own chance, and every chance, `injection` included, is from 0 to 1. Labels left out count as 0. Any other answer fails as `bad_reply`.
- `options.signal` fires when Quard stops waiting. Pass it to your model call.
- Throw `DetectorError` with a short reason, such as `"timeout"` or `"http_429"`, to name a failure in the warning. Other errors are recorded as `error`.

## Signature feeds

A signature feed is a JSON list of known attack strings, such as a scam IBAN, a phishing domain or a download piped into a shell. Quard checks the arguments of every guarded call against it, and the results of tools with a source guard.

```ts
import { quard } from "quard";

// From a file, reread when it changes
quard.configure({ signatures: { file: "./signatures.json" } });

// Or from a URL, downloaded every refreshSeconds. Use one of the two.
quard.configure({ signatures: { url: "https://feeds.acme.com/signatures.json", refreshSeconds: 600 } });
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `file` | `string` | none | A feed file. A relative path is read from the working directory. Set exactly one of `file` and `url` |
| `url` | `string` | none | An `http` or `https` URL, downloaded at once and then every `refreshSeconds`, with an ETag |
| `refreshSeconds` | whole number, 1 or more | `300` | Seconds between downloads |
| `mode` | `"block"` or `"observe"` | `"block"` | `"observe"` only records matches |

```json
{
    "$schema": "./signatures.schema.json",
    "version": "1",
    "signatures": [
        {
            "id": "ACME-IBAN-001",
            "title": "IBAN reported in invoice scams",
            "category": "other",
            "where": ["input", "content"],
            "any": ["NL91 ABNA 0417 1643 00"],
            "action": "block"
        }
    ]
}
```

- `version` is a string. `id` is 3 to 40 capital letters, digits or dashes, unique in the feed, and `title` says what it catches in up to 120 characters. `category` is `code-execution`, `unsafe-deserialization`, `supply-chain`, `ssrf`, `path-traversal`, `prompt-injection` or `other`. Optional `tools` limits a signature to those tool names, and optional `source` is a URL that describes it.
- A signature matches when the text holds every `all` string, at least one `any` string and no `none` string. It needs at least one `all` or `any` string. `QS-EXEC-006` in the starter feed uses all three. Strings are plain text, not patterns, and both sides lose case, spaces and hidden characters before matching.
- With `input` in `where`, it checks the arguments of every guarded call, whatever the guards' modes: `block` refuses the call with `signature_matched`, and `flag` asks a person. With `content`, it checks results of tools with a source guard, and acts only when that guard is in block mode: `block` withholds the result with `content_blocked`, and `flag` adds the flag `signature:<id>`.
- A feed file is read when `configure()` sets it, which throws if the file is missing or invalid. Before guarded calls, Quard rereads it when it changed, at most once a second.
- A URL feed fails closed: until its first download works, every guarded call is refused with `signatures_unavailable`, unless `mode` is `"observe"`. Guarded calls wait for a download in progress, for up to 10 seconds.
- A failed or invalid update keeps the last good version and records a `config_error` event with `source: "signatures"`.
- The policy file's `signatures` wins over code, and a relative `file` there is read from the policy file's folder.
- Start from the repo's [starter feed](https://github.com/oynozan/quard/blob/main/packages/sdk/examples/signatures/signatures.json) and its [schema](https://github.com/oynozan/quard/blob/main/packages/sdk/examples/signatures/signatures.schema.json).

Full docs: [policy file](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/policy-file.mdx), [configuration and origins](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/configure.mdx), [detector and signatures](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/detector.mdx) and [labels and trust](https://github.com/oynozan/quard/blob/main/docs/content/concepts/labels.mdx).
