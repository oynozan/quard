import type { SearchMatch, SearchResult } from "@/lib/data/search";
import type { RunRow } from "@/lib/data/runs/types";

export const BASE = Date.UTC(2026, 9, 3, 12, 0, 0);
export const RUN_A = "4bf92f3577b34da6a3ce929d0e0e4736";
export const RUN_B = "c3a8f0d2e5b14976a0c2d8e1f6b3a947";

export function matchOf(extra: Partial<SearchMatch> = {}): SearchMatch {
    return {
        runId: RUN_A,
        stepId: "s3",
        agent: "billing",
        tool: "pay_invoice",
        field: "iban",
        value: "DE89…3000",
        kind: "iban",
        label: { origin: "supplier-portal.example", trust: "untrusted", sensitivity: "public" },
        at: BASE + 5_000,
        byHash: true,
        match: "exact",
        ...extra,
    };
}

export function runOf(extra: Partial<RunRow> = {}): RunRow {
    return {
        id: RUN_A,
        rootAgent: "researcher",
        agents: ["researcher", "billing"],
        status: "blocked",
        startedAt: BASE,
        durationMs: 60_000,
        steps: 12,
        costUsd: 0.12,
        decisions: { allowed: 4, asked: 1, blocked: 1 },
        untrusted: true,
        tools: ["fetch_page", "pay_invoice"],
        incidentId: null,
        approvalId: null,
        ...extra,
    };
}

export function resultOf(extra: Partial<SearchResult> = {}): SearchResult {
    return {
        query: "supplier-portal.example",
        kind: "domain",
        byHash: false,
        hash: null,
        shown: "supplier-portal.example",
        matches: [matchOf()],
        total: 1,
        runs: 1,
        truncated: false,
        ...extra,
    };
}
