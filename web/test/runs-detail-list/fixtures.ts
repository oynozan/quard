import type {
    GuardDecision,
    RunAgent,
    RunDetail,
    RunEdge,
    RunLimitUse,
    RunRow,
    Step,
    StepArg,
} from "@/lib/data/runs/types";
import type { Label, ValueAppearance } from "@/lib/data/types";

// Small builders for the run page and runs list tests.

export const START = Date.UTC(2026, 9, 3, 12, 0, 0);
export const RUN_ID = "abcdef0123456789abcdef0123456789";

export const TRUSTED: Label = { origin: "system", trust: "trusted", sensitivity: "internal" };
export const UNTRUSTED: Label = { origin: "web:acme.net", trust: "untrusted", sensitivity: "public" };

export function makeRow(fields: Partial<RunRow> = {}): RunRow {
    return {
        id: RUN_ID,
        rootAgent: "billing",
        agents: ["billing"],
        status: "completed",
        startedAt: START,
        durationMs: 75_000,
        steps: 12,
        costUsd: 0.0062,
        costKnown: true,
        decisions: { allowed: 3, asked: 0, blocked: 0 },
        untrusted: false,
        tools: [],
        incidentId: null,
        approvalId: null,
        ...fields,
    };
}

export function makeStep(fields: Partial<Step> = {}): Step {
    return {
        id: "1111111111111111",
        parentId: null,
        agent: "billing",
        kind: "model_call",
        name: "gpt-5.4-mini",
        startedAt: START,
        durationMs: 400,
        status: "ok",
        context: TRUSTED,
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
        ruleHash: "rule-hash-1",
        rulesHash: "rules-hash-1",
        policy: null,
        reason: "The IBAN came from a web page.",
        degraded: false,
        scan: null,
        ...fields,
    };
}

export function makeAgent(fields: Partial<RunAgent> & Pick<RunAgent, "name">): RunAgent {
    return {
        version: "1.0.0",
        model: "gpt-5.4-mini",
        parent: null,
        depth: 0,
        tools: [],
        steps: 0,
        modelCalls: 0,
        costUsd: 0,
        startedAt: START,
        endedAt: START,
        influenced: false,
        ...fields,
    };
}

export function makeEdge(fields: Partial<RunEdge> = {}): RunEdge {
    return {
        stepId: "2222222222222222",
        kind: "delegation",
        from: "billing",
        to: "researcher",
        at: START + 1500,
        channel: "in-process",
        carries: [],
        untrusted: false,
        summary: "Look up the invoice sender",
        ...fields,
    };
}

export function makeLimit(fields: Partial<RunLimitUse> & Pick<RunLimitUse, "name">): RunLimitUse {
    return { used: 1, limit: 3, unit: "levels", mode: "observe", over: false, ...fields };
}

export function makeAppearance(fields: Partial<ValueAppearance> = {}): ValueAppearance {
    return {
        label: UNTRUSTED,
        stepId: "3333333333333333",
        agent: "billing",
        at: START + 3000,
        match: "exact",
        ...fields,
    };
}

export function makeArg(fields: Partial<StepArg> = {}): StepArg {
    return {
        name: "iban",
        value: "GB33…5555",
        masked: false,
        valueLabel: { kind: "iban", traced: true, generated: false, appearances: [makeAppearance()] },
        ...fields,
    };
}

export function makeDetail(fields: Partial<RunDetail> = {}): RunDetail {
    const agents = [makeAgent({ name: "billing", steps: 1 })];
    return {
        summary: makeRow(),
        agents,
        graph: { nodes: agents, edges: [] },
        steps: [makeStep()],
        limits: [makeLimit({ name: "depth" })],
        payments: [],
        warnings: [],
        ...fields,
    };
}
