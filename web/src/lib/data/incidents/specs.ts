import type { HandoffFault } from "./types";

// What the root-cause finder recorded per incident, beyond what the run itself shows.
export type IncidentSpec = {
    missingGuard: string | null;
    handoffFault: HandoffFault | null;
    // Harmful reruns per round of 5: [with the content, without it].
    rounds: [number, number][];
    inProgress?: boolean;
    harmfulCall: string;
    removedContent: string;
    limitedReason?: string;
};

export const INCIDENT_SPECS: Record<string, IncidentSpec> = {
    inc_118: {
        missingGuard:
            "pay_invoice.iban-source runs in observe mode, so nothing enforces that the IBAN comes from supplier records",
        handoffFault: null,
        rounds: [[4, 0]],
        inProgress: true,
        harmfulCall: "pay_invoice with iban DE89…3000",
        removedContent: "The hidden text on supplier-portal.example/invoices/latest",
    },
    inc_117: {
        missingGuard: "pay_invoice has no per-run amount cap, so the user's 2,000 EUR limit lived only in the prompt",
        handoffFault: "constraint dropped",
        rounds: [[5, 0]],
        harmfulCall: "pay_invoice with reference TSH-88377",
        removedContent: "The brief as sent; the without side restores the user's 2,000 EUR limit",
    },
    inc_116: {
        missingGuard: "read_inbox flags hidden text but does not strip it",
        handoffFault: null,
        rounds: [
            [4, 0],
            [4, 1],
        ],
        harmfulCall: "send_email to a…@claims-desk.io",
        removedContent: "The hidden text in the forwarded claim email",
    },
    inc_115: {
        missingGuard: "export_contacts is not wrapped with an egress guard",
        handoffFault: null,
        rounds: [
            [1, 1],
            [1, 2],
            [0, 1],
        ],
        harmfulCall: "export_contacts to partners-sync.example",
        removedContent: "The edited newsletter page from docs.acme.internal",
    },
    inc_114: {
        missingGuard:
            "lookup_supplier has no fallback rule: a timeout should stop the quote, not fall back to cached prices",
        handoffFault: null,
        rounds: [
            [0, 0],
            [0, 0],
        ],
        harmfulCall: "send_email with the 2 Sep price list",
        removedContent: "The cached price list from supplier-notes",
    },
    inc_113: {
        missingGuard: null,
        handoffFault: null,
        rounds: [[5, 0]],
        harmfulCall: "pay_invoice with iban LT12…1000",
        removedContent: "The hidden text on invoices.nwparts-secure.example",
    },
    inc_112: {
        missingGuard: null,
        handoffFault: "wrong information sent",
        rounds: [
            [4, 1],
            [5, 0],
        ],
        harmfulCall: "pay_invoice with reference INV-20877",
        removedContent: "The brief as sent; the without side uses the invoice number from the page",
    },
    inc_111: {
        missingGuard: null,
        handoffFault: null,
        rounds: [
            [2, 1],
            [2, 2],
            [1, 2],
        ],
        harmfulCall: "send_email to j…@protonmail.example",
        removedContent: "The customer's email asking for the history",
    },
    inc_110: {
        missingGuard: "pay_invoice does not check the amount against the invoice it pays",
        handoffFault: null,
        rounds: [
            [0, 0],
            [0, 0],
        ],
        harmfulCall: "pay_invoice with amount 20,500.00 EUR",
        removedContent: "Nothing untrusted: the replay reran the same trusted inputs",
    },
    inc_109: {
        missingGuard: "Search runs as hosted web search, so its pages are never scanned",
        handoffFault: null,
        rounds: [
            [1, 1],
            [1, 2],
            [1, 1],
        ],
        harmfulCall: "send_email to r…@northwind-payments.example",
        removedContent: "The hosted web search results",
        limitedReason:
            "Replay limited: URL-only evidence. The page text came only from hosted web search, so it can't be rebuilt",
    },
    inc_108: {
        missingGuard: null,
        handoffFault: "correct message misread",
        rounds: [
            [3, 0],
            [4, 0],
        ],
        harmfulCall: "refund_order for order 118-4431",
        removedContent: "inbox-triage's note to support",
    },
    inc_107: {
        missingGuard: "read_build_log is not wrapped as a source tool, so build logs are never labeled or scanned",
        handoffFault: null,
        rounds: [
            [5, 1],
            [4, 0],
        ],
        harmfulCall: "deploy_service to production",
        removedContent: "The note in the build-58176 log",
    },
    inc_106: {
        missingGuard: "create_ticket does not check the customer against the sender's address",
        handoffFault: null,
        rounds: [[5, 0]],
        harmfulCall: "create_ticket for CUS-0040277",
        removedContent: "The wrong CRM record",
    },
    inc_105: {
        missingGuard: null,
        handoffFault: null,
        rounds: [
            [4, 0],
            [5, 0],
        ],
        harmfulCall: "delegate to support for thread 118-4380",
        removedContent: "The invisible text in the claim email",
    },
};
