// 27 · A paid API in a loop
//
// A retry loop, or many helpers, can pay the same endpoint hundreds of
// times. The x402 guard caps what one run spends, in USD, and how many
// payments it makes. quard.x402Fetch(fetch) sits under the x402 client
// and records every price, payment and settlement.
//
// The app calls a quote API that costs $0.01 a call, up to ten times in
// one run.
//
//   1  maxPerRun: 0.05: five payments settle, and the sixth is refused
//      before it is signed.
//   2  maxPaymentsPerRun: 3: the fourth payment is refused.
//
// The calls run outside guard(), so the x402 client throws, and the
// error message holds the refusal. Pass it to the model as the result.
//
// No chain, wallet or API key: a local x402 server, a stub facilitator
// and a fake signer.
//
// Run: node sandbox/27-paid-api-in-a-loop.ts

import { wrapFetchWithPayment } from "@x402/fetch";
import { quard, type X402Options } from "quard";
import { title } from "./lib/show.ts";
import { startPaidApi } from "./lib/x402/server.ts";
import { paymentLine } from "./lib/x402/show.ts";
import { testWallet } from "./lib/x402/wallet.ts";

const api = await startPaidApi({
    origin: "https://quotes.example",
    amount: "10000",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    answer: () => `EUR/USD ${(1.08 + Math.random() / 100).toFixed(4)}`,
});

quard.configure({
    onEvent: (event) => {
        if (event.type === "payment" && event.stage !== "challenged" && event.stage !== "signed") {
            console.log(`    · ${paymentLine(event)}`);
        }
    },
});

async function loop(options: X402Options): Promise<void> {
    const wallet = quard.x402(testWallet(), options);
    const paidFetch = wrapFetchWithPayment(quard.x402Fetch(api.fetch), wallet);
    await quard.run({ agent: "trader" }, async () => {
        for (let call = 1; call <= 10; call++) {
            try {
                const response = await paidFetch("https://quotes.example/eur-usd");
                console.log(`  Call ${call}: ${await response.text()}`);
            } catch (error) {
                console.log(`  Call ${call}: ${(error as Error).message}`);
                console.log("  The loop stopped.");
                return;
            }
        }
    });
}

title("1 · maxPerRun: 0.05");
await loop({ type: "x402", name: "quotes", maxPerRun: 0.05 });

title("2 · maxPaymentsPerRun: 3");
await loop({ type: "x402", name: "quotes", maxPaymentsPerRun: 3 });

await api.close();
