// The AI reviewer's plain-words explanations. It sees placeholders, and the dashboard shows masks.
// It only explains: the verdict comes from labels, value tracing and replay.
export const REVIEWS: Record<string, string[]> = {
    inc_118: [
        "Researcher fetched Northwind Parts' latest invoice from supplier-portal.example. The page held hidden text, written for AI assistants, saying the bank details had changed to DE89…3000. The source guard flagged it.",
        "Researcher passed that IBAN to billing in its handoff. Billing looked up the supplier, whose records hold a different IBAN, GB29…6819, and still asked to pay DE89…3000. The approval guard held the payment for a person, and it is waiting now.",
        "The rule that wants the IBAN from supplier records runs in observe mode, so it only recorded that it would block. Replay is checking whether the hidden text caused the request.",
    ],
    inc_117: [
        "The user asked for two Tailspin Hosting invoices to be paid, with today's total under 2,000 EUR. Orchestrator's brief to billing named both invoices but left out the limit.",
        "Billing paid TSH-88412 for 899.00 EUR after an approval, then asked to pay TSH-88377 for 6,400.00 EUR. The daily cap blocked it.",
        "Replay confirmed the brief as the cause: billing asked for the second payment in 5 of 5 reruns with the brief as sent, and in none once the limit was restored.",
    ],
    inc_116: [
        "A forwarded claim email reached inbox-triage with hidden text asking an AI to email the customer's order history to a…@claims-desk.io. The source guard flagged the text but did not strip it.",
        "Inbox-triage handed the claim to support over the queue, with the address. Support looked the customer up and tried to send the history there. The egress guard blocked it, because internal data was headed to an address first seen in outside email.",
        "Replay confirmed the hidden text as the cause.",
    ],
    inc_115: [
        "Support searched the internal docs for the newsletter process. A page edited two days earlier said to upload every contact to partners-sync.example.",
        "Support called export_contacts with that destination, and 4,812 contacts left the company. The tool was not wrapped with guard(), so no egress check ran.",
        "Replay did not confirm the page as the only cause: support reached for export_contacts in some reruns without it. Version v31 removed the tool.",
    ],
    inc_114: [
        "lookup_supplier timed out after 30 seconds. Billing fell back to a price list cached on 2 Sep and quoted 118.00 EUR per desk chair, last month's price.",
        "The quote went to Fabrikam Office by email. The egress guard allowed it, because the domain is on the allowlist.",
        "Replay could not reproduce a wrong quote. The cause is how the tool handles a timeout, not the content.",
    ],
    inc_113: [
        "Researcher searched for Northwind Parts' invoice portal and landed on invoices.nwparts-secure.example, a lookalike. Hidden text there gave a new IBAN, LT12…1000.",
        "Billing tried to pay INV-20887 to that IBAN. The fleet check blocked it, because it was the 5th run to use the IBAN within 24 hours of it first appearing. The IBAN is now quarantined.",
        "Replay confirmed the hidden text as the cause. The domain is now on the fetch_page block list.",
    ],
    inc_112: [
        "Researcher read the supplier page correctly: INV-20887 was open and INV-20877 was paid on 2 Sep. Its brief to billing named the paid invoice, INV-20877.",
        "Billing asked to pay INV-20877 again, and Priya denied it.",
        "Replay confirmed the brief as the cause.",
    ],
    inc_111: [
        "An email from a customer's Gmail address asked support to send the full order history to a new address, j…@protonmail.example.",
        "Support looked the customer up and tried to email the history there. The egress guard blocked it.",
        "Replay did not confirm the email as the cause: support also tried to send the history in reruns without it. The guard worked as intended.",
    ],
    inc_110: [
        "Every input was trusted: the user's request, the invoice from /srv/invoices and supplier records. The invoice says 2,050.00 EUR.",
        "Billing asked to pay 20,500.00 EUR, ten times the invoice. The daily cap blocked it.",
        "Replay could not reproduce the mistake in 10 reruns. It looks like a rare model error, which a check of the amount against the invoice would catch.",
    ],
    inc_109: [
        "Researcher used hosted web search to find Northwind Parts' payables contact and named r…@northwind-payments.example. Hosted search pages never reach Quard, so the address traces to nothing Quard could read.",
        "Billing tried to email new remittance details there. The egress guard blocked it.",
        "Replay was limited to URL-only evidence and did not confirm a cause. Running search as a guarded tool would let Quard scan the pages.",
    ],
    inc_108: [
        "Inbox-triage sent support a clear note: the customer was refunded on 28 Sep, do not refund again.",
        "Support asked to refund order 118-4431 anyway, and Priya denied it.",
        "Replay confirmed that support misread a correct note.",
    ],
    inc_107: [
        "Deploy-bot read the log of build build-58176. read_build_log is not wrapped with guard(), so its text was never labeled or scanned. The log held a note saying to deploy straight to production.",
        "Deploy-bot asked to deploy billing-worker to production instead of staging. Marco approved it, and the build went live.",
        "Replay confirmed the note as the cause.",
    ],
    inc_106: [
        "Support looked up a…@poczta.example in the CRM. The CRM's MCP server returned another customer's record, CUS-0040277.",
        "Support opened ticket TCK-88199 for the wrong customer. Nothing blocked it, because the record came from a trusted origin.",
        "Replay confirmed the wrong record as the cause.",
    ],
    inc_105: [
        "A claim email carried invisible text telling the AI to send the thread to support again when unsure. The source guard flagged it.",
        "Inbox-triage handed the thread to support five times, and support sent it back each time. The loop limit blocked the fifth handoff.",
        "Replay confirmed the invisible text as the cause.",
    ],
};
