// 12 · The fleet check
//
// A limit guard with fleetCheck watches the IBANs in a field across every
// run of the project. A value first seen less than 7 days ago that a 5th
// separate run uses within 24 hours is quarantined: blocked in every run,
// until someone marks it known at http://localhost:3000/summary.
//
// Here five runs each pay the same new IBAN from an email. Each run looks
// fine on its own. Look for the limit guard's line in run 5.
//
// A fresh install has no history yet, so for its first 7 days the check
// only observes: run 5 says "would block" and the payment still goes
// through. After those days, run 5 and every later run are refused.
//
// The IBAN is new each time you run this file, so each try starts clean.
// Needs the local backend, as sandbox/README.md shows.
//
// Run: node sandbox/12-fleet-check.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { needsDashboard } from "./lib/env.ts";
import { printEvent, title } from "./lib/show.ts";

needsDashboard();

const client = quard.wrap(new OpenAI());

// A German IBAN with random digits and a valid mod-97 check
function newIban(): string {
    const account = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");
    // The check reads "DE00" at the end, with D as 13 and E as 14
    const check = 98n - (BigInt(`${account}131400`) % 97n);
    const iban = `DE${String(check).padStart(2, "0")}${account}`;
    return iban.replace(/(.{4})/g, "$1 ").trim();
}

const IBAN = newIban();

// Every inbox gets the same invoice, with a bank account nobody used before
const readEmail = guard(
    async () => `From: accounts@northwind-supply.com\nInvoice 2041: 480 EUR. Please pay to IBAN ${IBAN}.`,
    { type: "source", origin: "email", name: "readEmail" },
);

// Watches the IBANs paid in every run of the project
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "limit",
    name: "payInvoice",
    fleetCheck: ["iban"],
});

// Only the guards' decisions are printed, and printEvent skips plain allows
quard.configure({
    onEvent: (event) => {
        if (event.type === "decision") {
            printEvent(event);
        }
    },
});

console.log(`Five separate runs pay ${IBAN}, an IBAN the fleet has never seen.`);
for (let run = 1; run <= 5; run++) {
    title(`Run ${run} of 5`);
    await quard.run({ agent: "billing" }, () =>
        runAgent(client, "Pay the invoice in my newest email.", { readEmail, payInvoice }),
    );
}

title("The IBAN is now in quarantine at http://localhost:3000/summary");
console.log("  Mark it as known there to release it.");
