import type { SearchMatch, SearchResult } from "@/lib/data/search";
import type { RunRow } from "@/lib/data/runs/types";
import { IBAN_MASK, MAIN_DOMAIN } from "../search/events";

export const BASE = Date.UTC(2026, 9, 3, 12, 0, 0);
export const RUN_A = "4bf92f3577b34da6a3ce929d0e0e4736";
export const RUN_B = "c3a8f0d2e5b14976a0c2d8e1f6b3a947";

export function matchOf(extra: Partial<SearchMatch> = {}): SearchMatch {
    return {
        runId: RUN_A,
        stepId: "s3",
        agent: "billing",
        tool: "payInvoice",
        field: "iban",
        value: IBAN_MASK,
        label: { origin: "web:example.net", trust: "untrusted", sensitivity: "public" },
        at: BASE + 5_000,
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
        tools: ["fetchPage", "payInvoice"],
        incidentId: null,
        approvalId: null,
        ...extra,
    };
}

export function resultOf(extra: Partial<SearchResult> = {}): SearchResult {
    return {
        query: MAIN_DOMAIN,
        kind: "domain",
        byHash: false,
        shown: MAIN_DOMAIN,
        matches: [matchOf()],
        runRows: [runOf()],
        total: 1,
        runs: 1,
        truncated: false,
        ...extra,
    };
}
