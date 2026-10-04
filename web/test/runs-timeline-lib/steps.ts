import type { AgentLink, GuardDecision, RunAgent, Step } from "@/lib/data/runs/types";
import type { Label } from "@/lib/data/types";

// Small builders for timeline tests: a step, a guard decision, a link and an agent.

export const START = Date.UTC(2026, 9, 3, 12, 0, 0);

export const TRUSTED_INTERNAL: Label = { origin: "system", trust: "trusted", sensitivity: "internal" };
export const TRUSTED_PUBLIC: Label = { origin: "user", trust: "trusted", sensitivity: "public" };
export const UNTRUSTED_PUBLIC: Label = { origin: "web:acme.net", trust: "untrusted", sensitivity: "public" };
export const UNTRUSTED_INTERNAL: Label = { origin: "mail", trust: "untrusted", sensitivity: "internal" };

let counter = 0;

export function makeStep(fields: Partial<Step> = {}): Step {
    counter += 1;
    return {
        id: counter.toString(16).padStart(16, "0"),
        parentId: null,
        agent: "billing",
        kind: "model_call",
        name: "gpt-5.4-mini",
        startedAt: START,
        durationMs: 400,
        status: "ok",
        context: TRUSTED_INTERNAL,
        influenced: false,
        detail: "",
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

export function makeGuard(fields: Partial<GuardDecision> = {}): GuardDecision {
    return {
        guard: "action",
        tool: "payInvoice",
        outcome: "block",
        mode: "block",
        rule: "iban:from",
        ruleHash: "r1",
        rulesHash: "h1",
        reason: "value_not_from_allowed_origin",
        degraded: false,
        scan: null,
        ...fields,
    };
}

export function makeLink(fields: Partial<AgentLink> = {}): AgentLink {
    return {
        kind: "delegation",
        from: "billing",
        to: "researcher",
        channel: "in-process",
        carries: [],
        labelRef: "ref",
        untrusted: false,
        verified: true,
        summary: "",
        ...fields,
    };
}

export function makeAgent(name: string, parent: string | null): RunAgent {
    return {
        name,
        version: "1.0.0",
        model: "gpt-5.4-mini",
        parent,
        depth: 0,
        tools: [],
        steps: 0,
        modelCalls: 0,
        costUsd: 0,
        startedAt: START,
        endedAt: START,
        influenced: false,
    };
}
