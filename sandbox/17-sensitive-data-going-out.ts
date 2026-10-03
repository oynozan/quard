// 17 · Sensitive data going out
//
// An egress guard also reads what a call sends. In every text argument it
// looks for three kinds of sensitive data: secrets such as API keys, card
// numbers and IBANs. payload says what to do with each kind:
//   allow  send it as it is
//   mask   send "•••• 1111" (a card) or "DE89…3000" (an IBAN) in its
//          place; the tool never sees the real value
//   block  refuse the call
//
// A kind you leave out follows the policy file's strictness. Without a
// policy file that is "balanced": secrets block, cards mask, IBANs pass.
// "strict" blocks cards and masks IBANs; "lenient" masks secrets.
//
// When a tool's arguments don't name where data goes, in a field such as
// to or url, destinations tells the guard. With onFail: "ask", a place
// that isn't on the allow list asks a human instead of being refused.
// Here the human is a function in this file that always says no.
//
// Run: node sandbox/17-sensitive-data-going-out.ts

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { guard, quard, type ApprovalAnswer, type ApprovalRequest } from "quard";
import { runAgent } from "./lib/agent.ts";
import { printEvent, title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// A fresh fake key each run, so no key sits in this file
const KEY = `sk-proj-${randomUUID().replaceAll("-", "")}`;
// A test card number and a sample IBAN
const CARD = "4111 1111 1111 1111";
const IBAN = "DE89 3704 0044 0532 0130 00";

// The tool returns what it was given, so you see what it really received
async function send(input: { to: string; body: string }) {
    return `sent to ${input.to}: ${input.body}`;
}

// The model only sees partner names. Each one posts to its own URL.
const PARTNERS: Record<string, string> = {
    globex: "https://hooks.globex.com/acme",
    initech: "https://hooks.initech-partners.net/acme",
};

function partnerUrl(input: unknown): string | undefined {
    return PARTNERS[(input as { partner: string }).partner.toLowerCase()];
}

// The approver gets the call after masking, and where each value came from
async function approver(request: ApprovalRequest): Promise<ApprovalAnswer> {
    console.log(`    ? approver asked about ${request.tool} ${JSON.stringify(request.input)}`);
    console.log("    ? approver: deny");
    return "deny";
}

// Print what the guards decided. Allowed calls stay quiet.
quard.configure({
    approver,
    onEvent: (event) => {
        if (event.type === "decision") {
            printEvent(event);
        }
    },
});

// Every kind set in code
const sendEmail = guard(send, {
    type: "egress",
    name: "sendEmail",
    allow: ["acme.com"],
    payload: { secrets: "block", cards: "mask", ibans: "allow" },
});

title("A card number is masked, an IBAN goes through");
await quard.run({ agent: "support" }, () =>
    runAgent(
        client,
        `Email finance@acme.com exactly this text: "Refund the double charge on card ${CARD} to IBAN ${IBAN}."`,
        { sendEmail },
    ),
);

title("An API key is blocked");
await quard.run({ agent: "support" }, () =>
    runAgent(client, `Email devops@acme.com exactly this text: "The new payments API key is ${KEY}"`, {
        sendEmail,
    }),
);

// The partner name is not a field the guard knows, so destinations turns
// it into a URL. Without it, the guard finds no destination and every
// call with internal data, such as the user's message, would ask.
const notifyPartner = guard(
    async (input: { partner: string; message: string }) => `posted to ${partnerUrl(input)}: ${input.message}`,
    {
        type: "egress",
        name: "notifyPartner",
        allow: ["hooks.globex.com"],
        destinations: (input) => {
            const url = partnerUrl(input);
            return url === undefined ? [] : [url];
        },
        onFail: "ask",
    },
);

title("Where a call goes, from a function; a place off the allow list asks");
await quard.run({ agent: "support" }, () =>
    runAgent(client, 'Send both our partners, Globex and Initech, this message: "Order 4471 shipped today."', {
        notifyPartner,
    }),
);

// Only cards set in code; secrets and IBANs follow the preset
const sendEmailCardsOnly = guard(send, {
    type: "egress",
    name: "sendEmail",
    allow: ["acme.com"],
    payload: { cards: "mask" },
});
const prompt = `Email finance@acme.com exactly this text: "Card ${CARD} was charged twice. Refund it to IBAN ${IBAN}."`;

title("IBANs left out: no policy file, so the balanced preset lets them through");
await quard.run({ agent: "support" }, () => runAgent(client, prompt, { sendEmail: sendEmailCardsOnly }));

// A real app keeps the file next to its code. This one is temporary.
const folder = mkdtempSync(join(tmpdir(), "quard-policy-"));
const policyFile = join(folder, "quard.policy.json");
writeFileSync(policyFile, JSON.stringify({ version: 1, strictness: "strict" }, null, 4));
quard.configure({ policyFile });

title('The same call with strictness "strict" in the policy file: the IBAN is masked too');
await quard.run({ agent: "support" }, () => runAgent(client, prompt, { sendEmail: sendEmailCardsOnly }));

rmSync(folder, { recursive: true });
