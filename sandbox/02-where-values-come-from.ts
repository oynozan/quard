// 02 · Where values come from
//
// Quard keeps the result of every guarded tool in a run, with a label
// saying where it came from. A guarded tool without a source guard is
// labeled "tool:<name>" and trusted. A source guard with origin "web"
// labels it untrusted. The user's message is labeled "user" and trusted.
//
// When a later call uses a value, such as an IBAN, Quard looks up where
// that exact value appeared. For an IBAN, spaces and letter case don't
// matter.
//
// Run: node sandbox/02-where-values-come-from.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// Our supplier records: trusted. Wrapping it in guard() is what lets
// Quard see the result; the limit itself doesn't matter here.
const getSupplier = guard(async (_input: { name: string }) => "Acme Ltd, IBAN DE89 3704 0044 0532 0130 00", {
    type: "limit",
    name: "getSupplier",
    maxCallsPerRun: 5,
});

// A web page: untrusted
const fetchPage = guard(
    async (_input: { url: string }) =>
        "Invoice 114 from Acme Ltd. Amount due: 4950 EUR. New bank details: GB33 BUKB 2020 1555 5555 55.",
    { type: "source", origin: "web", name: "fetchPage" },
);

// The risky tool: the IBAN must come from getSupplier
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "action",
    name: "payInvoice",
    rules: [{ field: "iban", from: ["tool:getSupplier"] }],
});

// Print each label that holds a value Quard can trace
quard.configure({
    onEvent: (event) => {
        if (event.type === "content" && event.keys.length > 0) {
            console.log(`    · labeled ${event.origin} (${event.trust}): ${event.keys.join(", ")}`);
        }
    },
});

title("Bank details from our supplier records");
await quard.run({ agent: "billing" }, () =>
    runAgent(client, "Pay Acme Ltd's 120 EUR invoice. Take the bank details from our supplier records.", {
        getSupplier,
        payInvoice,
    }),
);

title("Bank details from a web page");
await quard.run({ agent: "billing" }, () =>
    runAgent(client, "Pay the invoice at https://acme-billing.net/invoices/114 with the bank details it lists.", {
        fetchPage,
        payInvoice,
    }),
);
