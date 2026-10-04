# x402 payments

This file covers paying with x402 under Quard: the x402 guard that checks each payment before the wallet signs it (`quard.x402()`), its options and checks, the recorders `quard.x402Fetch()` and `quard.x402Mcp()`, what gets recorded, payment statuses, and how a refused payment reaches the model.

## Contents

- [How x402 and Quard fit](#how-x402-and-quard-fit)
- [Set it up over HTTP](#set-it-up-over-http)
- [Options](#options)
- [The checks](#the-checks)
- [Amounts, tokens and hosts](#amounts-tokens-and-hosts)
- [Totals](#totals)
- [Approval above an amount](#approval-above-an-amount)
- [When a payment is refused](#when-a-payment-is-refused)
- [quard.x402Fetch()](#quardx402fetch)
- [x402 over MCP](#x402-over-mcp)
- [What Quard records](#what-quard-records)
- [Policy file and observe mode](#policy-file-and-observe-mode)
- [More](#more)

## How x402 and Quard fit

x402 lets an agent pay for a request on the spot. The server answers `402 Payment Required` with a price: one or more payment options, each with a network, an asset (the token), an amount in atomic units (the token's smallest unit) and a payee address, `payTo`. The client's wallet signs a payment for one option and sends the request again. The server settles the payment and answers.

| Part | Where it goes | What it does |
| --- | --- | --- |
| `quard.x402(client, options)` | On an `@x402/core` x402 client | The x402 guard. Checks each payment after the client picks an option and before the wallet signs. A refused payment is never signed |
| `quard.x402Fetch(fetch)` | Under the client: the `fetch` that `wrapFetchWithPayment()` calls | Records each price, payment and settlement. Sends only payments an x402 guard checked, and only to the host it checked |
| `quard.x402Mcp(mcpClient)` | Under `x402MCPClient` from `@x402/mcp` | The same for paid MCP tools |

- Use the guard and a recorder together. The guard alone records only its decisions and refusals.
- Some checks use the control link, the SDK's live connection to the `control` service (`key` and `controlUrl`, see [setup.md](setup.md)): the day total across processes, the fleet check, which blocks a payee that many separate runs suddenly pay, and approvals in the dashboard.
- `@x402/core` is an optional peer dependency of `quard`, at `^2.28.0`. Install it, plus `@x402/fetch` for HTTP or `@x402/mcp` for MCP. Quard's own tests use 2.28.0 of all three. Build the x402 client as the x402 docs show, with a scheme and a signer for each network you pay on.

## Set it up over HTTP

```ts
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { guard, quard } from "quard";

// Register your schemes and signer on the client first
const wallet = quard.x402(new x402Client(), {
    type: "x402",
    name: "wallet",
    maxPerPayment: 0.1,
    maxPerRun: 1,
    maxPaymentsPerRun: 20,
    untrusted: "block",
});
// Under the client: records payments, sends only checked ones
const paidFetch = wrapFetchWithPayment(quard.x402Fetch(fetch), wallet);

// A refused payment comes back as this tool's result
const fetchPaid = guard(
    async (input: { url: string }) => {
        const response = await paidFetch(input.url);
        return `${response.status} ${await response.text()}`;
    },
    { type: "limit", name: "fetchPaid" },
);
```

- Call `quard.x402()` once per client, at startup. It adds hooks to the client and returns the same client, so a second call checks and counts each payment twice.
- Pass `quard.x402Fetch(fetch)` to `wrapFetchWithPayment()`, so it sits under the client. Wrapped around the paid fetch instead, it never sees a payment. Every x402 client whose payments go through it needs `quard.x402()`, because a payment no guard checked is never sent.
- Call the paid fetch from a guarded tool inside `quard.run()`. The guard then sees what the run read, which the `untrusted` check needs, and a refusal comes back as the tool's result.
- Give the x402 guard its own `name`, not a tool's. Totals, decisions and the policy file go by it, and a shared name shares counters.
- The options' type is `X402Options`, exported from `quard`. `guard()` throws for them, so pass them to `quard.x402()` only.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `type` | `"x402"` | required | Anything else makes `quard.x402()` throw |
| `name` | `string` | `"x402"` | The guard's name. Decisions carry it as `tool`, totals count under it, and the policy file lists the guard under it |
| `mode` | `"block" \| "observe"` | `"block"` | The mode of every option you set |
| `onBlock` | `"return" \| "throw"` | `"return"` | `"throw"` makes a guarded tool throw `GuardBlockedError` for a refused payment |
| `maxPerPayment` | `number` | 1, observes | The most one payment may cost, in USD |
| `maxPerRun` | `number` | 5, observes | The most the guard's payments in one run may add up to, in USD |
| `maxPerDay` | `number` | 50, observes | The most per UTC day, in USD. With the control link, across every process of the project |
| `maxPaymentsPerRun` | `number` | off | The most payments in one run, whatever the token. It catches loops |
| `allowHosts` | `string[]` | off | Only these hosts may be paid. `"acme.com"` is that host only, `"*.acme.com"` adds its subdomains |
| `blockHosts` | `string[]` | off | These hosts are never paid. Same patterns |
| `untrusted` | `"block" \| "allow"` | on, observes | `"block"` refuses a host or payee first seen in untrusted content. `"allow"` turns the check off |
| `assetCaps` | `Record<string, string>` | off | Caps for tokens with no known USD value: asset address to a cap in atomic units, such as `"1000000"` |
| `fleetCheck` | `boolean` | on, observes | Refuses a payee the fleet check quarantined. `false` turns it off |
| `approveAbove` | `number` | off | Asks a person before a payment above this many USD |

- An option you set runs in the guard's `mode`, which is `"block"` unless you change it. `maxPerPayment`, `maxPerRun`, `maxPerDay`, `untrusted` and `fleetCheck` are on even when left out. Those product defaults only observe: they record "would block" and let the payment through. To make one block, set it, even to its default value: `maxPerRun: 5`, `untrusted: "block"`, `fleetCheck: true`.
- With `mode: "observe"`, every rule observes, apart from the amount check below.
- `quard.x402()` throws for a cap that is negative or not a number, and for an `assetCaps` value that isn't 1 to 78 digits.

## The checks

Before each payment, the guard runs its rules in this order and records each one as a `decision` event with `guard: "x402"`. The last column is what the refusal says after "Blocked by the x402 guard:".

| Rule | Fails when | Reason | Refusal text |
| --- | --- | --- | --- |
| `valid-amount` | The amount can't be read. Blocks in any mode | `x402_invalid_amount` | the payment amount could not be read |
| `max-per-payment` | The USD value is above `maxPerPayment` | `x402_over_payment_limit` | the payment is over the limit for one payment |
| `asset-caps` | A token with no USD value has a cap, and the amount is above it | `x402_unknown_value_over_cap` | the amount is over the cap for this token |
| `block-hosts` | The host matches `blockHosts`, or the price names no host | `x402_host_blocked` | this host may not be paid |
| `allow-hosts` | The host doesn't match `allowHosts`, or the price names no host | `x402_host_blocked` | this host may not be paid |
| `untrusted` | The paid URL, its host or the payee first appeared in untrusted content in this run | `x402_untrusted_payee` | the host or payee first appeared in untrusted content |
| `max-payments-per-run` | This payment would pass `maxPaymentsPerRun` | `x402_too_many_payments` | this run made too many payments |
| `max-per-run` | The run's USD total would pass `maxPerRun` | `x402_over_run_limit` | the payment is over the run limit |
| `max-per-day` | The day's USD total would pass `maxPerDay` | `x402_over_day_limit` | the payment is over the daily limit |
| `fleet-check` | `control` quarantined the payee | `x402_payee_quarantined` | the payee is new and many runs paid it at once, so it is blocked everywhere |
| `approve-above` | The USD value is above `approveAbove`. The decision is "ask" | `approval_required` | None by itself. A refused ask uses the answer's reason, such as `approval_denied` |

Then the strictest enforced result wins: block, then ask, then allow. Rules in observe mode never count. On "ask", a person answers before the wallet signs. Last, the payment is added to the run's totals, then the day's, and the payee is reported to `control`. Each step can still refuse it, such as when another process reached a cap first.

## Amounts, tokens and hosts

- The amount is the picked option's `amount` (x402 v2) or `maxAmountRequired` (v1), read as a signer reads it: a whole number, or text `BigInt` reads such as `"1000000"` or `"0xF4240"`. It must not be negative or longer than 78 digits.
- USD values come from a fixed list: USDC on Base, Base Sepolia, Ethereum, Polygon, Avalanche, Solana and Solana devnet, at 6 decimals. EVM addresses match in any letter case, Solana addresses exactly. A total equal to a cap passes; only a total above it is refused.
- Any other token has no USD value. The USD caps and `approveAbove` skip it, while `maxPaymentsPerRun`, the host and payee checks and `assetCaps` still apply. Set those for such tokens.
- The host is the host of the paid URL the price names: `resource.url` in v2, the option's `resource` in v1. `allowHosts` and `blockHosts` refuse a price that names no URL.
- The `untrusted` check looks for where this run first saw the paid URL or its host (the exact URL, the same host, or the same main domain, which doesn't count for a host in `allowHosts`), and the payee (exact address only). A first sighting in untrusted content, such as a web page, fails. A URL, host or payee the run never saw passes. Wrap the tools that read outside content with a source guard, so Quard knows what is untrusted. See [guards.md](guards.md).
- The fleet check quarantines a payee first seen in the last 7 days once 5 separate runs try to pay it within 24 hours. It only observes for the first 7 days after a project starts using it, and needs the control link: without it, the rule records "allow". A quarantined payee stays blocked until someone marks it as known in the dashboard. See [guards.md](guards.md).

## Totals

- Totals count per guard `name` and per run, across the run's agents. Wrap each task in `quard.run()`, so run totals count per task. Outside a run, a payment joins the run where `quard.x402Fetch()` or `quard.x402Mcp()` saw its price, so later tasks that pay the same URL add to that run. Without a recorder, each payment outside a run starts its own run, and run totals can't add up.
- A payment counts after its checks and any approval, just before signing. It still counts if the server later turns it down.
- `maxPerDay` counts per UTC day. With the control link on, `control` keeps one total for the whole project. Without it, the total covers this process only.
- In a run that crosses processes, with the control link on, `control` keeps the run's payment count and USD total. See [multi-agent.md](multi-agent.md).

## Approval above an amount

- `approveAbove` asks the `approver` set in `quard.configure()`, else a person in the dashboard through the control link. With neither, the payment is refused with `approval_unavailable`. See [guards.md](guards.md) for approvals.
- The request's `tool` is the guard's name. Its `input` holds `host`, `resource`, `payTo`, `amount`, `asset`, `usd`, `network` and `scheme`. The guard sets no timeout, and asks before signing, because a signed payment is valid only for a short time.
- After a yes, the checks run again without `approveAbove`, and a block that came up meanwhile still refuses the payment. An "always" answer covers later payments with the same agent, guard name and payment details.

## When a payment is refused

The guard records a `decision` event for the rule that refused it, a `payment` event with the stage `refused` and the reason code, and, with the fleet check and the control link on, reports the payee to `control` as blocked. Then it aborts the payment in the client's hook, so the wallet never signs it. The refusal text has one shape, and the model reads it:

```text
Blocked by the x402 guard: the payment is over the run limit. The x402 payment did NOT happen. Do not retry it.
```

| Where the payment runs | What your code gets |
| --- | --- |
| Inside a tool wrapped with `guard()` | The tool returns a `GuardRefusal` with `guard: "x402"`, the x402 guard's name as `tool`, and the reason. Send `refusal.text` back as the tool result, as for any refusal. The `tool_call` event has the status `blocked` |
| The same, with `onBlock: "throw"` on the x402 guard | The tool throws `GuardBlockedError`. Its `refusal` holds the same details |
| Outside a guarded tool | The x402 client throws an `Error` whose message holds the refusal. `@x402/core` puts `Payment creation aborted: ` in front, and `@x402/fetch` adds `Failed to create payment payload: ` before that. `@x402/mcp` passes the error on as it is |

- The payment must happen inside the guarded tool's own call, awaited there, so Quard can tie the two together. A tool that catches the error itself returns what it returns instead.
- Outside a guarded tool, catch the error and give its message to the model as the tool result:

```ts
// Outside guard(), the x402 client throws, and the message holds the refusal
async function fetchQuote(url: string): Promise<string> {
    try {
        const response = await paidFetch(url);
        return await response.text();
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}
```

The [checks table](#the-checks) gives each reason's text. A payment that asked a person and got no yes is refused in the same shape with the approval's reason, such as `approval_denied` ("a human denied it") or `approval_unavailable`. Never retry a refused payment, and never route it through another client to get around the guard.

## quard.x402Fetch()

`quard.x402Fetch(fetch)` returns a `fetch` that records x402 payments and calls the `fetch` you pass in. Responses come back unchanged.

- A request with no payment header goes out as it is. On a `402`, Quard reads the price (the v2 `PAYMENT-REQUIRED` header, else a v1 price in the JSON body), records a `challenged` event with the first option listed, and keeps the price with the run for that URL.
- A request with a payment header (`PAYMENT-SIGNATURE`, or v1's `X-PAYMENT`) goes out only when an x402 guard checked that exact payment for the request's host. Quard records `signed`, sends it, and reads the settlement from `PAYMENT-RESPONSE` or `X-PAYMENT-RESPONSE`.
- Any other payment is not sent. The request gets a `403` with `x-should-retry: false` and a JSON body whose `error` has `type: "quard_blocked"`, `code: "unguarded_x402"` and one of these messages:

```text
Blocked by Quard: no x402 guard checked this payment. The x402 payment did NOT happen. Do not retry it.
Blocked by Quard: the x402 guard checked this payment for another host. The x402 payment did NOT happen. Do not retry it.
```

- Quard records these as `refused`, with the reason `unguarded` or `host_mismatch`. The first `unguarded` one in a process also records an `unguarded_x402` warning. Quard answers `403`, not `402`, so the client doesn't pay again. `wrapFetchWithPayment()` returns that `403` as the response, without throwing, so pass the status and body to the model, as the setup sample does. Don't retry it.

## x402 over MCP

A paid MCP tool answers with its price as an error result, or as a JSON-RPC error with code `402`. The payment travels in `_meta["x402/payment"]`, and the settlement comes back in the result's `_meta["x402/payment-response"]`. Wrap your MCP client with `quard.x402Mcp()` and pay through `x402MCPClient` with a guarded x402 client:

```ts
import { x402Client } from "@x402/core/client";
import { x402MCPClient } from "@x402/mcp";
import { guard, quard } from "quard";

// mcp is your connected Client from @modelcontextprotocol/sdk
const mcpWallet = quard.x402(new x402Client(), { type: "x402", name: "mcpWallet", maxPerRun: 1 });
const paidTools = new x402MCPClient(quard.x402Mcp(mcp), mcpWallet);

const weather = guard(
    async (input: { city: string }) => JSON.stringify((await paidTools.callTool("weather", input)).content),
    { type: "limit", name: "weather" },
);
```

- `quard.x402Mcp(client)` returns the client with its `callTool()` replaced, and every other method and property passes through. A call with no payment goes through, and a price in its error result or `402` error is recorded as `challenged`. A call with a payment runs only when an x402 guard checked that exact payment. Otherwise it returns an error result (`isError: true`) with the "no x402 guard checked this payment" text, and nothing is sent.
- Records use the server's name from `getServerVersion()` as the host, else `mcp`. The paid URL is the price's `resource.url`, else `mcp://tool/<tool name>`.
- The guard's host rules check the host of that paid URL, and for `mcp://tool/weather` that host is `tool`. So host lists rarely fit MCP payments: lean on the USD caps, `maxPaymentsPerRun` and `fleetCheck` there. `quard.x402Mcp()` doesn't compare hosts.
- If TypeScript rejects your `Client` in `new x402MCPClient()` with "separate declarations of a private property", the app has two copies of `@modelcontextprotocol/sdk`. Dedupe them, or cast as Quard's own test does: `quard.x402Mcp(mcp) as unknown as ConstructorParameters<typeof x402MCPClient>[0]`.

## What Quard records

| Stage | Recorded by | When |
| --- | --- | --- |
| `challenged` | `x402Fetch()`, `x402Mcp()` | A server named a price, even one the guard went on to refuse |
| `refused` | The guard, `x402Fetch()`, `x402Mcp()` | The guard refused the payment before signing, with its reason code, or a payment wasn't sent (`unguarded`, `host_mismatch`) |
| `signed` | `x402Fetch()`, `x402Mcp()` | A checked payment was sent |
| `settled` | `x402Fetch()`, `x402Mcp()` | The server settled it, with `transaction` and `delivered` |
| `failed` | `x402Fetch()`, `x402Mcp()` | Settling failed (`reason`: the server's `errorReason`, else `settle_failed`), or the server turned the payment down with another price (`reason`: its `error`, else `payment_rejected`) |

- Each `payment` event carries the run, step and agent, `host`, `resource` (the paid URL with secrets removed), `x402Version`, `scheme`, `network`, `asset`, `amount` in atomic units, `usd` (null when the token has no known USD value) and `payTo`.
- **Paid, not delivered**: a payment that settled while the paid response was an error, an HTTP status of 400 or more or an MCP error result, has `delivered: false`. The run view flags it.
- A step joins the current run. Outside a run, it joins the run that saw the price for the same URL, or the same MCP server and tool. Otherwise it starts a run under the agent `default`.
- The dashboard shows payment steps in the run view, and spend in the runs list, the overview and the Summary page. To act on payments in code, read them in `onEvent`:

```ts
import { quard } from "quard";

quard.configure({
    onEvent: (event) => {
        if (event.type === "payment" && event.stage === "settled" && event.delivered === false) {
            console.warn(`Paid, not delivered: ${event.resource}`);
        }
    },
});
```

## Policy file and observe mode

A policy file can set the guard's options under `guards` and the guard's `name`. The first entry there with `type: "x402"` replaces the options in code, from the next payment on. A list with no x402 entry leaves the code options in force. There, `maxPaymentsPerRun` must be a whole number. See [policy-and-detector.md](policy-and-detector.md).

```json
{
    "version": "2026-10-04.1",
    "guards": {
        "wallet": [{ "type": "x402", "maxPerRun": 1, "maxPaymentsPerRun": 5, "untrusted": "block" }]
    }
}
```

To roll out, start with `mode: "observe"`, or with the defaults alone. Every rule then records "would block" with `enforced: false` and lets the payment through, apart from `valid-amount`. Payments still count toward totals. Watch the x402 decisions in the dashboard, then remove `mode: "observe"` and set the options that should block.

## More

- Docs: [payments concept](https://github.com/oynozan/quard/blob/main/docs/content/concepts/payments.mdx), [x402 reference](https://github.com/oynozan/quard/blob/main/docs/content/sdk/reference/x402.mdx), [x402 internals](https://github.com/oynozan/quard/blob/main/docs/content/sdk/internals/payments.mdx), [runs guide](https://github.com/oynozan/quard/blob/main/docs/content/guides/runs.mdx), [summary guide](https://github.com/oynozan/quard/blob/main/docs/content/guides/summary.mdx).
- Examples: [a paid link in a poisoned page](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/paid-link-in-a-page.mdx) and [a paid API in a loop](https://github.com/oynozan/quard/blob/main/docs/content/sdk/examples/paid-api-in-a-loop.mdx), runnable as [`sandbox/26-paid-link-in-a-page.ts`](https://github.com/oynozan/quard/blob/main/sandbox/26-paid-link-in-a-page.ts) and [`sandbox/27-paid-api-in-a-loop.ts`](https://github.com/oynozan/quard/blob/main/sandbox/27-paid-api-in-a-loop.ts).
- Code: [`guards/x402/x402.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/guards/x402/x402.ts), [`guards/x402/checks.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/guards/x402/checks.ts), [`x402/fetch/fetch.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/x402/fetch/fetch.ts), [`x402/mcp/mcp.ts`](https://github.com/oynozan/quard/blob/main/packages/sdk/x402/mcp/mcp.ts), [`stablecoins.ts`](https://github.com/oynozan/quard/blob/main/packages/shared/x402/stablecoins.ts).
