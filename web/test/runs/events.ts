import type { ingestBatch } from "@quard/db";

// One event in its upload envelope, as ingest takes it
export type UploadItem = Parameters<typeof ingestBatch>[2][number];
type RunEvent = UploadItem["event"];

const MODEL = "1".repeat(16);
const PAY = "2".repeat(16);
const FETCH = "3".repeat(16);
const IBAN_KEY = `iban:GB33…5555#${"e".repeat(32)}`;

let next = 0;

// Each event gets a fresh id, and a degraded one was sent late
export function item(event: RunEvent, degraded = false): UploadItem {
    next += 1;
    return { id: next.toString(16).padStart(16, "d"), event, ...(degraded ? { degraded } : {}) };
}

export const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds)).toISOString();

// The poisoned-invoice run as webhook stores it, redacted and with hashed value keys
export function attack(runId: string, agent: string, ended = false): UploadItem[] {
    const base = { runId, agent };
    const finished: RunEvent = { type: "run_finished", ...base, at: at(4), status: "completed" };
    const events: RunEvent[] = [
        ...(ended ? [finished] : []),
        { type: "run_started", ...base, at: at(0), origins: {} },
        {
            type: "model_call",
            ...base,
            stepId: MODEL,
            at: at(2),
            model: "gpt-5.4-mini",
            status: "ok",
            durationMs: 900,
            toolCalls: [{ callId: "c1", name: "payInvoice", arguments: "{}" }],
            usage: { inputTokens: 2000, cachedTokens: 1000, outputTokens: 500 },
        },
        {
            type: "content",
            ...base,
            stepId: MODEL,
            at: at(1),
            contentId: "c1",
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: [],
            keys: [IBAN_KEY],
        },
        {
            type: "decision",
            ...base,
            stepId: PAY,
            at: at(3),
            tool: "payInvoice",
            guard: "action",
            rule: "iban:from",
            decision: "block",
            mode: "block",
            enforced: true,
            reason: "value_not_from_allowed_origin",
            field: "iban",
        },
        {
            type: "tool_call",
            ...base,
            stepId: PAY,
            at: at(3),
            tool: "payInvoice",
            callId: "c1",
            arguments: { iban: "GB33…5555", amount: 4950 },
            status: "blocked",
            influenced: true,
            flagged: false,
            durationMs: 0,
            keys: [IBAN_KEY],
        },
    ];
    return events.map((event) => item(event));
}

// A fetched page the detector scored in observe mode, with the score sent late
export function scoredFetch(runId: string, agent: string): UploadItem[] {
    const base = { runId, agent, stepId: FETCH, at: at(6) };
    return [
        item({
            type: "tool_call",
            ...base,
            tool: "fetchPage",
            arguments: { url: "https://acme-billing.net/invoices/114" },
            status: "ok",
            influenced: false,
            flagged: true,
            durationMs: 300,
        }),
        item(
            {
                type: "decision",
                ...base,
                tool: "fetchPage",
                guard: "source",
                rule: "detector:jev",
                decision: "flag",
                mode: "observe",
                enforced: false,
                score: 0.87,
            },
            true,
        ),
    ];
}
