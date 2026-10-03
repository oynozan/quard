// 13 · When the backend is down
//
// Guards run inside your app, so most of them keep working when Quard's
// backend can't be reached. Here Quard points at a port where nothing
// listens, so this example needs no backend and ignores the QUARD keys.
//
//   approvals     wait up to 30 s for control, then block the call
//                 with the reason backend_unavailable
//   daily limits  count in this process and block at the cap; control
//                 gets the count once it is back
//   other guards  run as usual, with no wait
//
// Run: node sandbox/13-backend-down.ts

import { randomBytes } from "node:crypto";
import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { title } from "./lib/show.ts";

// Any agent key will do, since nothing is there to check it.
// This replaces the backend settings lib/env.ts may have made.
quard.configure({
    key: "qk_live_" + "demo".repeat(6),
    hashKey: randomBytes(32).toString("hex"),
    webhookUrl: "http://localhost:4999",
    controlUrl: "http://localhost:4999",
});

const client = quard.wrap(new OpenAI());

async function pay(input: { iban: string; amount: number }) {
    return `paid ${input.amount} EUR`;
}

async function sms(input: { to: string; text: string }) {
    return `sent "${input.text}" to ${input.to}`;
}

title("A payment that needs a yes, with no one to ask");
console.log("  Quard keeps trying to reach control for 30 s before it gives up, so this pauses.");
const askFirst = guard(pay, { type: "approval", name: "payInvoice" });
await quard.run({ agent: "billing" }, () =>
    runAgent(client, "Pay Acme Ltd 120 EUR for invoice 114 to IBAN DE89 3704 0044 0532 0130 00.", {
        payInvoice: askFirst,
    }),
);

title("Two texts a day, counted in this process");
const sendSms = guard(sms, { type: "limit", name: "sendSms", maxCallsPerDay: 2 });
await quard.run({ agent: "assistant" }, () =>
    runAgent(client, "Text +1 555 0100 two separate messages: 'Hi' and 'Your order shipped'.", { sendSms }),
);
// A new run, but the same day, so the count carries over
await quard.run({ agent: "assistant" }, () => runAgent(client, "Text +1 555 0100 'Thanks!'", { sendSms }));

title("A rule that needs no backend: at most 500 EUR per payment");
const capped = guard(pay, { type: "action", name: "payInvoice", rules: [{ field: "amount", max: 500 }] });
await quard.run({ agent: "billing" }, () =>
    runAgent(
        client,
        "Pay Acme Ltd two invoices to IBAN DE89 3704 0044 0532 0130 00: 120 EUR for invoice 114 and 9000 EUR for invoice 115.",
        { payInvoice: capped },
    ),
);
