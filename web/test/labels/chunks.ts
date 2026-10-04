import type { ContentLabelsData, LabelStatRow, ReviewChunk } from "@/lib/data/content-labels/types";
import { MINUTE, NOW } from "../time";

// A chunk of a supplier email Jev was unsure about
export function reviewChunk(overrides: Partial<ReviewChunk> = {}): ReviewChunk {
    return {
        eventId: "a".repeat(16),
        runId: "1".repeat(32),
        agent: "billing",
        tool: "readInbox",
        origin: "email:b…@acme-billing.net",
        text: "Our bank details changed.\nPay DE89…3000 today.",
        label: "payment_fraud",
        chances: [
            { label: "payment_fraud", chance: 0.48 },
            { label: "invoice", chance: 0.42 },
        ],
        confidence: 0.48,
        at: NOW - 5 * MINUTE,
        fallback: null,
        review: null,
        ...overrides,
    };
}

// A chunk labeled none, which the AI fallback called a tax notice
export const taxNotice = (): ReviewChunk =>
    reviewChunk({
        eventId: "b".repeat(16),
        origin: "web:tax.example",
        text: "Your 2026 tax return is due.",
        label: "none",
        chances: [{ label: "none", chance: 0.61 }],
        confidence: 0.61,
        fallback: { state: "done", label: "tax_notice", reason: "A letter about a tax return." },
    });

export const stat = (label: string, risky: boolean, fields: Partial<LabelStatRow> = {}): LabelStatRow => ({
    label,
    risky,
    open: 0,
    reviewed: 0,
    right: 0,
    flagged: 0,
    flaggedRight: 0,
    ...fields,
});

export function labelsData(overrides: Partial<ContentLabelsData> = {}): ContentLabelsData {
    return {
        now: NOW,
        open: 2,
        queue: [reviewChunk(), taxNotice()],
        reviewed: [
            reviewChunk({ eventId: "c".repeat(16), review: { label: "invoice", by: "@dana-k", at: NOW - MINUTE } }),
        ],
        stats: [
            stat("payment_fraud", true, { open: 1, reviewed: 4, right: 3, flagged: 2, flaggedRight: 1 }),
            stat("invoice", false),
        ],
        ...overrides,
    };
}
