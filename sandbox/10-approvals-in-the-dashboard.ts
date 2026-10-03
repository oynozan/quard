// 10 · Approvals in the dashboard
//
// With an agent key, a call that needs a yes waits on the dashboard's
// approvals page until someone answers there. Each step says what to click.
//
//   1  An approval guard asks before every payment. Click Always approve.
//   2  The same payment again, in a new run. It passes without asking,
//      because Always approve covers the same agent, tool and arguments.
//   3  An action rule asks only above 1000 EUR. The small payment just
//      runs. Approve or deny the big one.
//   4  An approval guard with a 15 second timeout. Don't answer: the call
//      is refused, and the request stays open on the page.
//
// Always approve lasts until someone revokes it on the approvals page, so
// on the next run step 1 passes at once too. Revoke it to be asked again.
//
// Run: node sandbox/10-approvals-in-the-dashboard.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { needsDashboard } from "./lib/env.ts";
import { printEvent, title } from "./lib/show.ts";

needsDashboard();

const client = quard.wrap(new OpenAI());

// An action rule asks again after the yes, so the link prints once per call
const asked = new Set<string>();
quard.configure({
    onEvent: (event) => {
        if (event.type !== "decision") {
            return;
        }
        if (event.decision === "ask" && !asked.has(event.stepId)) {
            asked.add(event.stepId);
            printEvent(event);
            console.log("    · waiting. Answer at http://localhost:3000/approvals");
        }
        if (event.rule === "always-approved") {
            console.log("    · answered at once by the earlier Always approve");
        }
    },
});

async function pay(input: { iban: string; amount: number }) {
    return `paid ${input.amount} EUR`;
}

// No spaces, so the model sends the exact same arguments in step 2
const IBAN = "DE89370400440532013000";

title("1 · Every payment asks first. Click Always approve.");
const payInvoice = guard(pay, { type: "approval", name: "payInvoice" });
const samePayment = `Pay Acme Ltd 480 EUR for invoice 301 to IBAN ${IBAN}.`;
await quard.run({ agent: "payments" }, () => runAgent(client, samePayment, { payInvoice }));

title("2 · The same payment again, in a new run. No click needed.");
await quard.run({ agent: "payments" }, () => runAgent(client, samePayment, { payInvoice }));

title("3 · Ask only above 1000 EUR. Approve or deny.");
const payLarge = guard(pay, {
    type: "action",
    name: "payInvoice",
    rules: [{ field: "amount", max: 1000, onFail: "ask" }],
});
await quard.run({ agent: "payments" }, () =>
    runAgent(
        client,
        `Pay Acme Ltd two invoices to IBAN ${IBAN}: 300 EUR for invoice 302 and 4200 EUR for invoice 303.`,
        { payInvoice: payLarge },
    ),
);

title("4 · Nobody answers. Wait 15 seconds.");
const payTimed = guard(pay, { type: "approval", name: "payInvoice", timeout: 15 });
await quard.run({ agent: "payments" }, () =>
    runAgent(client, `Pay Acme Ltd 75 EUR for invoice 304 to IBAN ${IBAN}.`, { payInvoice: payTimed }),
);
console.log("  The request is still open at http://localhost:3000/approvals");
