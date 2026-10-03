import type { ApprovalRequestInput } from "@quard/db";

// Rows as webhook and control store them, for tests against PGlite

export const ASKED_STEP = "2".repeat(16);
export const IBAN_KEY = `iban:GB33…5555#${"e".repeat(32)}`;
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds)).toISOString();

let next = 0;
const eventId = () => (++next).toString(16).padStart(16, "d");

// A run whose payInvoice call waits for a human. Its IBAN came from a web page.
export function waitingRun(runId: string) {
    const base = { runId, agent: "billing" };
    const events = [
        { type: "run_started", ...base, at: at(0), origins: {} },
        {
            type: "content",
            ...base,
            stepId: "1".repeat(16),
            at: at(1),
            contentId: "c1",
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: [],
            keys: [IBAN_KEY],
        },
        {
            type: "tool_call",
            ...base,
            stepId: "1".repeat(16),
            at: at(1),
            tool: "fetchPage",
            callId: "c0",
            arguments: { url: "https://acme-billing.net/invoices/114" },
            status: "ok",
            influenced: false,
            flagged: false,
            durationMs: 200,
            keys: [],
        },
        {
            type: "model_call",
            ...base,
            stepId: "3".repeat(16),
            at: at(2),
            model: "gpt-5.4-mini",
            status: "ok",
            durationMs: 500,
            toolCalls: [{ callId: "c1", name: "payInvoice", arguments: "{}" }],
        },
        {
            type: "decision",
            ...base,
            stepId: ASKED_STEP,
            at: at(3),
            tool: "payInvoice",
            guard: "approval",
            rule: "approval",
            decision: "ask",
            mode: "block",
            enforced: true,
            reason: "approval_required",
        },
    ];
    return events.map((event) => ({ id: eventId(), event: event as never }));
}

// What control stores when that call asks
export function askInput(runId: string, fields: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
    return {
        runId,
        stepId: ASKED_STEP,
        agent: "billing",
        tool: "payInvoice",
        argsHash: "c".repeat(32),
        args: { iban: "GB33 BUKB 2020 1555 5555", amount: 4950 },
        masked: { iban: "GB33…5555", amount: 4950 },
        labels: [
            {
                path: "iban",
                values: [
                    {
                        type: "iban",
                        generated: false,
                        origins: [
                            {
                                origin: "web:acme-billing.net",
                                trust: "untrusted",
                                sensitivity: "public",
                                flags: [],
                                stepId: "1".repeat(16),
                                match: "exact",
                            },
                        ],
                    },
                ],
            },
        ],
        context: { trust: "untrusted", sensitivity: "public", origins: ["web:acme-billing.net"], flagged: false },
        reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
        rulesHash: "d".repeat(16),
        ...fields,
    };
}
