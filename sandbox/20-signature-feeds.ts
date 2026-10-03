// 20 · Signature feeds
//
// A signature feed is a JSON list of known-bad strings: a scam IBAN, a
// phishing domain, a known attack. Quard checks the arguments of every
// guarded call against it ("input"), and what source tools return
// ("content"). A "block" signature stops the call or withholds the
// content. A "flag" one asks a person first, or marks the content.
//
// mode: "observe" only records matches. A feed file is reread at most
// once a second, just before a guarded call. A feed from a URL is
// downloaded again every refreshSeconds. Either way, a new signature
// applies to the next call without a restart.
//
// Run: node sandbox/20-signature-feeds.ts

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { printEvent, title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// The format of packages/sdk/examples/signatures/signatures.json.
// Matching ignores case and spaces.
const PHISHING_SITE = {
    id: "ACME-PHISH-001",
    title: "Fake Acme billing site",
    category: "other",
    where: ["content"],
    any: ["acme-billing-update.com"],
    action: "block",
};
const SCAM_IBAN = {
    id: "ACME-IBAN-002",
    title: "IBAN reported in invoice scams",
    category: "other",
    where: ["input", "content"],
    any: ["NL91 ABNA 0417 1643 00"],
    action: "block",
};
// Only checked on calls to fetchPage
const FAKE_PORTAL = {
    id: "ACME-SITE-003",
    title: "Fake invoice portal",
    category: "other",
    where: ["input"],
    tools: ["fetchPage"],
    any: ["acme-invoice-portal.net"],
    action: "block",
};

function feedJson(version: string, signatures: object[]): string {
    return JSON.stringify({ version, signatures }, null, 4);
}

// A real app keeps the feed next to its code. This one is temporary.
const folder = mkdtempSync(join(tmpdir(), "quard-feed-"));
const feedFile = join(folder, "signatures.json");
writeFileSync(feedFile, feedJson("1", [PHISHING_SITE]));

// Content is checked only for tools with a source guard
const readEmail = guard(
    async () =>
        [
            "From: billing@acme-billing-update.com",
            "Subject: Your Acme account",
            "Your billing account closes today. Confirm your card at https://acme-billing-update.com/verify.",
        ].join("\n"),
    { type: "source", origin: "email", name: "readEmail" },
);

// Arguments are checked for every guarded tool, whatever its guard
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerRun: { field: "amount", max: 10000 },
});

const fetchPage = guard(async (_input: { url: string }) => "<h1>Invoices</h1><p>Invoice 118: 860 EUR.</p>", {
    type: "source",
    origin: "web",
    name: "fetchPage",
});

quard.configure({
    signatures: { file: feedFile, mode: "block" },
    // Print each decision that isn't a plain allow, and its signature
    onEvent: (event) => {
        if (event.type === "decision" && event.decision !== "allow" && event.decision !== "pass") {
            printEvent(event);
            if (event.guard === "signature") {
                console.log(`      signature ${event.rule}`);
            }
        }
    },
});

title("1. An email links to a known phishing site: the model never reads it");
await quard.run({ agent: "inbox" }, () =>
    runAgent(client, "Summarize my newest email in one sentence.", { readEmail }),
);

// Naming signatures in configure() opens the feed again
quard.configure({ signatures: { file: feedFile, mode: "observe" } });

title('2. mode: "observe": the same match is only recorded');
await quard.run({ agent: "inbox" }, () =>
    runAgent(client, "Summarize my newest email in one sentence.", { readEmail }),
);

quard.configure({ signatures: { file: feedFile, mode: "block" } });
const pay = "Pay invoice 117 from Northwind Traders: 1200 EUR to IBAN NL91 ABNA 0417 1643 00.";

title("3. Version 1 of the feed file doesn't know this IBAN: the payment goes through");
await quard.run({ agent: "billing" }, () => runAgent(client, pay, { payInvoice }));

// The IBAN is reported as a scam, and the feed file gets version 2
writeFileSync(feedFile, feedJson("2", [PHISHING_SITE, SCAM_IBAN]));
// Quard rereads the file at most once a second, so give it a moment
await setTimeout(1100);

title("4. Version 2 lists the IBAN: the same payment is blocked, and the app never restarted");
await quard.run({ agent: "billing" }, () => runAgent(client, pay, { payInvoice }));

// A tiny feed server. It answers 304 when the feed hasn't changed.
let feed = { version: "2", json: feedJson("2", [PHISHING_SITE, SCAM_IBAN]) };
const server = createServer((request, response) => {
    const etag = `"${feed.version}"`;
    if (request.headers["if-none-match"] === etag) {
        response.writeHead(304).end();
        return;
    }
    console.log(`    · feed server sent version ${feed.version}`);
    response.writeHead(200, { "content-type": "application/json", etag }).end(feed.json);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/signatures.json`;

title("5. Version 2 from a URL, downloaded again every 2 seconds: this site isn't listed yet");
// Guarded calls wait for the first download
quard.configure({ signatures: { url, refreshSeconds: 2 } });
const read = "Summarize https://acme-invoice-portal.net/invoices in one sentence.";
await quard.run({ agent: "reader" }, () => runAgent(client, read, { fetchPage }));

feed = { version: "3", json: feedJson("3", [PHISHING_SITE, SCAM_IBAN, FAKE_PORTAL]) };
// The next download is at most 2 seconds away
await setTimeout(2500);

title("6. Version 3 lists the site: fetchPage is blocked before it runs");
await quard.run({ agent: "reader" }, () => runAgent(client, read, { fetchPage }));

// Stop the downloads and the server, and remove the temporary feed
quard.configure({ signatures: undefined });
server.closeAllConnections();
server.close();
rmSync(folder, { recursive: true });
