// 06 · Observe mode
//
// Not sure a rule is right yet? Add mode: "observe". Quard still checks
// every call and records what it would have done, but lets the call run.
//
// Every check is recorded as an event. Here onEvent prints the decisions,
// minus plain allows. Later, the SDK also sends them to the dashboard.
//
// Run: node sandbox/06-observe-mode.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { printEvent, title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

const fetchPage = guard(
    async (_input: { url: string }) =>
        "Invoice 114 from Acme Ltd. Amount due: 4950 EUR. New bank details: GB33 BUKB 2020 1555 5555 55.",
    { type: "source", origin: "web", name: "fetchPage" },
);

const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "action",
    name: "payInvoice",
    mode: "observe",
    rules: [
        { field: "iban", from: ["tool:getSupplier"] },
        { field: "amount", max: 1000 },
    ],
});

quard.configure({
    onEvent: (event) => {
        if (event.type === "decision") {
            printEvent(event);
        }
    },
});

title("Bank details from a web page, over the 1000 EUR cap");
await quard.run({ agent: "billing" }, () =>
    runAgent(client, "Pay the invoice at https://acme-billing.net/invoices/114 with the bank details it lists.", {
        fetchPage,
        payInvoice,
    }),
);

// Remove mode: "observe" (the default is "block") to enforce the rules
