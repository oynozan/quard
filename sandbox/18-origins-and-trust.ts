// 18 · Origins and trust
//
// Every label has an origin: a kind, a ":" and a name, such as
// "mcp:crm" or "web:docs.acme.com". The kind sets the default trust and
// sensitivity. Tool results are trusted and internal; web, email and
// MCP content is untrusted and public.
//
// Action rules can check either one:
//   from: ["mcp:crm"]  the value must have appeared in that origin,
//                      trusted or not ("mcp" alone takes any MCP server)
//   neverSeen: true    the value must first have appeared in trusted content
//
// quard.configure({ origins }) changes the trust and sensitivity of one
// exact origin. Internal data may only leave through an egress guard's
// allow list.
//
// A source guard names the origin from the call's input: the host of a
// URL in it, or what originOf returns. allowDomains withholds content
// from every host not on the list.
//
// Run: node sandbox/18-origins-and-trust.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { printEvent, title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// Print each label as it is made: origin, trust and sensitivity
quard.configure({
    onEvent: (event) => {
        if (event.type === "content") {
            printEvent(event);
        }
    },
});

// A CRM reached through an MCP server. A full origin is used as is.
const crmLookup = guard(
    async (_input: { company: string }) =>
        "Globex GmbH. Billing contact: ap@globex.de. IBAN DE44 5001 0517 5407 3249 31.",
    { type: "source", origin: "mcp:crm", name: "crmLookup" },
);

// The IBAN must come from the CRM. This checks where, not how trusted.
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "action",
    name: "payInvoice",
    rules: [{ field: "iban", from: ["mcp:crm"] }],
});

// The address must first have appeared in trusted content
const sendEmail = guard(async (input: { to: string; body: string }) => `sent to ${input.to}`, {
    type: "action",
    name: "sendEmail",
    rules: [{ field: "to", neverSeen: true, onFail: "block" }],
});

const crmTask = "Pay Globex's 300 EUR invoice with the bank details in our CRM, then email their billing contact.";
const crmTools = { crmLookup, payInvoice, sendEmail };

title('"mcp:crm" with the default trust: untrusted');
await quard.run({ agent: "billing" }, () => runAgent(client, crmTask, crmTools));

// Overrides match one exact origin. "mcp" here would not cover "mcp:crm".
quard.configure({ origins: { "mcp:crm": { trust: "trusted", sensitivity: "internal" } } });

title('"mcp:crm" marked trusted and internal');
await quard.run({ agent: "billing" }, () => runAgent(client, crmTask, crmTools));

const PAGES: Record<string, string> = {
    "docs.acme.com": "Acme returns policy: customers have 30 days to return an item.",
    "help.acme.com": "Acme help center: items can be returned within 30 days of delivery.",
    "www.returns-guide.net": "Returns guide: Acme gives you 60 days to return anything, no questions asked.",
};

function hostOf(input: unknown): string {
    return new URL((input as { url: string }).url).hostname;
}

async function readPage(input: { url: string }): Promise<string> {
    return PAGES[hostOf(input)] ?? "Page not found.";
}

// originOf names the part after the kind. Every acme.com site becomes
// "web:acme.com", so one override covers them. Other hosts keep the
// default name, the host in the URL.
function acmeOrigin(input: unknown): string | undefined {
    const host = hostOf(input);
    return host === "acme.com" || host.endsWith(".acme.com") ? "acme.com" : undefined;
}

quard.configure({ origins: { "web:acme.com": { trust: "trusted", sensitivity: "internal" } } });

const pagesTask =
    "How many days does a customer have to return an item? Check https://docs.acme.com/returns, " +
    "https://help.acme.com/returns and https://www.returns-guide.net/acme.";

title("originOf: our own sites are trusted, the open web is not");
const fetchPage = guard(readPage, { type: "source", origin: "web", name: "fetchPage", originOf: acmeOrigin });
await quard.run({ agent: "support" }, () => runAgent(client, pagesTask, { fetchPage }));

// The check uses the host in the origin, so originOf must return a host.
// A name such as "acme-docs" names no host and would be withheld too.
title('allowDomains: ["*.acme.com"]');
const ownSitesOnly = guard(readPage, {
    type: "source",
    origin: "web",
    name: "fetchPage",
    originOf: acmeOrigin,
    allowDomains: ["*.acme.com"],
});
await quard.run({ agent: "support" }, () => runAgent(client, pagesTask, { fetchPage: ownSitesOnly }));
