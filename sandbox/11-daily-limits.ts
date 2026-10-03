// 11 · Daily limits
//
// maxCallsPerRun starts over with every run. maxCallsPerDay and
// maxAmountPerDay count a whole UTC day for the whole project. Control
// keeps that count, so every run and every process shares it.
//
// Run this file again: the count goes on from where it stopped, so
// calls that ran the first time are now refused. It starts over at
// midnight UTC.
//
// The last part puts the same caps in observe mode. Quard records that
// it would block, and lets the calls run. Those calls count too.
//
// Run: node sandbox/11-daily-limits.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { needsDashboard } from "./lib/env.ts";
import { printEvent, title } from "./lib/show.ts";

needsDashboard();

const client = quard.wrap(new OpenAI());

async function refund(input: { orderId: string }) {
    return `refunded order ${input.orderId}`;
}

async function pay(input: { iban: string; amount: number }) {
    return `paid ${input.amount} EUR`;
}

const IBAN = "DE89 3704 0044 0532 0130 00";

title("At most 3 refunds a day");
const refundOrder = guard(refund, { type: "limit", name: "refundOrder", maxCallsPerDay: 3 });
await quard.run({ agent: "support" }, () =>
    runAgent(client, "Refund orders 1001, 1002, 1003 and 1004.", { refundOrder }),
);

title("At most 1000 EUR of payments a day");
const payInvoice = guard(pay, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerDay: { field: "amount", max: 1000 },
});
await quard.run({ agent: "billing" }, () =>
    runAgent(client, `Pay three invoices to IBAN ${IBAN}: 400 EUR, 300 EUR and 500 EUR.`, { payInvoice }),
);

title("The same caps in observe mode");
quard.configure({
    onEvent: (event) => {
        if (event.type === "decision") {
            printEvent(event);
        }
    },
});
const watchedRefunds = guard(refund, { type: "limit", name: "refundOrder", mode: "observe", maxCallsPerDay: 3 });
const watchedPayments = guard(pay, {
    type: "limit",
    name: "payInvoice",
    mode: "observe",
    maxAmountPerDay: { field: "amount", max: 1000 },
});
await quard.run({ agent: "support" }, () =>
    runAgent(client, `Refund order 1005, then pay 500 EUR to IBAN ${IBAN}.`, {
        refundOrder: watchedRefunds,
        payInvoice: watchedPayments,
    }),
);
