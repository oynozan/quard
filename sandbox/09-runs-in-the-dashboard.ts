// 09 · Runs in the dashboard
//
// With an agent key and hash key in sandbox/.env, every run goes to the
// local backend in batches. Before anything leaves the process, secrets
// are removed and IBANs, card numbers and emails are masked. Their search
// keys keep a hash made with your hash key, so search still finds them.
//
// The same task runs three times and ends three ways the dashboard tells
// apart: completed, failed (a tool throws) and blocked (a guard throws).
// Open each link. The IBAN reads DE89…3000, the email j…@acme-ltd.co and
// the portal key is gone. Click a model call to see its tokens and cost.
//
// Run: node sandbox/09-runs-in-the-dashboard.ts

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent, type Tools } from "./lib/agent.ts";
import { needsDashboard } from "./lib/env.ts";
import { printEvent, title } from "./lib/show.ts";

needsDashboard();
const client = quard.wrap(new OpenAI());

// A fresh fake key each run, so no key sits in this file
const KEY = `sk-proj-${randomUUID().replaceAll("-", "")}`;
const RECORD = [
    "Acme Ltd",
    "IBAN: DE89 3704 0044 0532 0130 00",
    "Billing contact: jane.doe@acme-ltd.co",
    `Open invoices: https://portal.acme-ltd.co/invoices?api_key=${KEY}`,
].join("\n");

const PROMPT =
    "Pay Acme Ltd's open invoice. Get their bank details and portal link from our supplier records, " +
    "read the portal page for the amount, then email their billing contact that it is paid.";

// A limit guard only so the calls are recorded; the limit doesn't matter
const justRecord = { type: "limit", maxCallsPerRun: 5 } as const;
const getSupplier = guard(async (_input: { name: string }) => RECORD, { ...justRecord, name: "getSupplier" });
const sendEmail = guard(async (input: { to: string }) => `sent to ${input.to}`, { ...justRecord, name: "sendEmail" });

function portalPage(amount: number) {
    return guard(async (_input: { url: string }) => `Acme Ltd invoice 114: ${amount} EUR, due today.`, {
        ...justRecord,
        name: "fetchPage",
    });
}

// Errors often hold the URL they failed on, key and all
const portalDown = guard(
    async (input: { url: string }) => {
        throw new Error(`GET ${input.url} failed: 503 Service Unavailable`);
    },
    { ...justRecord, name: "fetchPage" },
);

// A payment over 5000 EUR stops the whole run
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "action",
    name: "payInvoice",
    rules: [{ field: "amount", max: 5000 }],
    onBlock: "throw",
});

// onEvent sees each event in this process, before any masking
quard.configure({
    onEvent: (event) => {
        if (event.type === "run_started") {
            console.log(`  Dashboard: http://localhost:3100/runs/${event.runId}`);
        } else if (event.type === "model_call" && event.usage !== undefined) {
            console.log(`    · ${event.model}: ${event.usage.inputTokens} tokens in, ${event.usage.outputTokens} out`);
        } else if (event.type === "run_finished") {
            console.log(`  The run ended: ${event.status}`);
        } else if (event.type === "decision" || (event.type === "tool_call" && event.status === "error")) {
            printEvent(event);
        }
    },
});

async function pay(heading: string, fetchPage: Tools[string]) {
    title(heading);
    const tools = { getSupplier, fetchPage, payInvoice, sendEmail };
    try {
        await quard.run({ agent: "billing" }, () => runAgent(client, PROMPT, tools));
    } catch {
        // A failed or blocked run rethrows; its ending is printed above
    }
}

await pay("The portal says 120 EUR", portalPage(120));
await pay("The portal is down", portalDown);
await pay("The portal says 9000 EUR", portalPage(9000));

title("Done. The SDK sends the last events as the process exits.");
