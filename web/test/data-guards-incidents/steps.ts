import { NOW } from "@/lib/data/rng";
import type { GuardDecision, Step } from "@/lib/data/runs/types";

// A plain finished step by billing. Fields passed in win.
export function stepOf(fields: Partial<Step> = {}): Step {
    return {
        id: "0123456789abcdef",
        parentId: null,
        agent: "billing",
        kind: "tool_call",
        name: "lookup_supplier",
        startedAt: NOW - 60_000,
        durationMs: 1_000,
        status: "ok",
        context: { origin: "user", trust: "trusted", sensitivity: "internal" },
        influenced: false,
        detail: "Looked up SUP-004417",
        args: [],
        output: null,
        model: null,
        guard: null,
        link: null,
        memory: null,
        approval: null,
        hosted: false,
        error: null,
        ...fields,
    };
}

// A guard decision in block mode that allowed the call. Fields passed in win.
export function guardOf(fields: Partial<GuardDecision> = {}): GuardDecision {
    return {
        guard: "action",
        tool: "lookup_supplier",
        outcome: "allow",
        mode: "block",
        rule: "lookup_supplier",
        ruleHash: "3b8e51f0a6c2",
        rulesHash: "3f9a0c7d1e24",
        reason: "SUP-004417 is in supplier records",
        degraded: false,
        scan: null,
        ...fields,
    };
}
