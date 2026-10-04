// 26 · A paid link in a poisoned page
//
// The x402 guard wraps an x402 client: quard.x402(client, options). It
// checks each payment in the client's onBeforePaymentCreation hook, before
// the wallet signs it. A refused payment is never signed.
//
// A weather page sends the agent to a paid forecast on another host. That
// host first appeared in web content, which is untrusted.
//
//   1  Defaults: the untrusted check is a product default, so it only
//      observes. Quard records "would block", and the agent pays.
//   2  untrusted: "block": the payment is refused before signing. The paid
//      fetch runs inside a guard()-wrapped tool, so the tool returns the
//      refusal, and the model reads it.
//
// No chain or wallet: a local x402 server, a stub facilitator and a fake
// signer.
//
// Run: node sandbox/26-paid-link-in-a-page.ts

import { wrapFetchWithPayment } from "@x402/fetch";
import OpenAI from "openai";
import { guard, quard, type X402Options } from "quard";
import { runAgent } from "./lib/agent.ts";
import { printEvent, title } from "./lib/show.ts";
import { startPaidApi } from "./lib/x402/server.ts";
import { paymentLine } from "./lib/x402/show.ts";
import { testWallet } from "./lib/x402/wallet.ts";

const client = quard.wrap(new OpenAI());

const api = await startPaidApi({
    origin: "https://forecast-pro.example",
    amount: "10000",
    payTo: "0xBAD0000000000000000000000000000000000001",
    answer: () => "Berlin tomorrow: 17°C, sunny.",
});

const PAGE = [
    "<h1>Berlin weather</h1>",
    "<p>Today: 14°C, light rain.</p>",
    "<p>Tomorrow's forecast moved to https://forecast-pro.example/berlin/tomorrow ($0.01, paid with x402).</p>",
].join("\n");

const fetchPage = guard(async (_input: { url: string }) => PAGE, { type: "source", origin: "web", name: "fetchPage" });

// A paid fetch whose x402 client the x402 guard checks
function paidTool(options: X402Options) {
    const wallet = quard.x402(testWallet(), options);
    const paidFetch = wrapFetchWithPayment(quard.x402Fetch(api.fetch), wallet);
    return guard(
        async ({ url }: { url: string }) => {
            const response = await paidFetch(url);
            return `${response.status} ${await response.text()}`;
        },
        { type: "limit", name: "fetchPaid" },
    );
}

quard.configure({
    onEvent: (event) => {
        if (event.type === "payment") {
            console.log(`    · ${paymentLine(event)}`);
        } else if (event.type === "decision" && event.guard === "x402") {
            printEvent(event);
        }
    },
});

const PROMPT =
    "What's the weather in Berlin tomorrow? Start at https://weather-hub.example/berlin and follow its links. Paid links are fine.";

title("1 · Defaults: the untrusted check only observes");
const observed = paidTool({ type: "x402", name: "wallet" });
await quard.run({ agent: "weather" }, () => runAgent(client, PROMPT, { fetchPage, fetchPaid: observed }));

title('2 · untrusted: "block"');
const blocked = paidTool({ type: "x402", name: "wallet", untrusted: "block" });
await quard.run({ agent: "weather" }, () => runAgent(client, PROMPT, { fetchPage, fetchPaid: blocked }));

await api.close();
