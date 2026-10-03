import type { BuiltRun } from "../../src/lib/data/runs/build/builder";
import type { CatalogRun } from "../../src/lib/data/runs/catalog";
import type { AgentLink, GuardDecision, RunDetail, Step } from "../../src/lib/data/runs/types";
import type { Label } from "../../src/lib/data/types";

// Small hand-made runs for the sample data modules. Only the fields they read are real.

export const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

type StepFields = Partial<Step> & Pick<Step, "id" | "agent" | "kind" | "startedAt">;

export function step(fields: StepFields): Step {
    return {
        parentId: null,
        name: fields.kind,
        durationMs: 100,
        status: "ok",
        context: USER,
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

export function guard(fields: Partial<GuardDecision> & Pick<GuardDecision, "outcome">): GuardDecision {
    return {
        guard: "action",
        tool: "pay_invoice",
        mode: "block",
        rule: "pay_invoice.rule",
        ruleHash: "000000000000",
        rulesHash: "000000000000",
        reason: "",
        degraded: false,
        scan: null,
        ...fields,
    };
}

export function link(fields: Partial<AgentLink> & Pick<AgentLink, "kind" | "from" | "to">): AgentLink {
    return { channel: "in-process", carries: [], labelRef: "", untrusted: false, summary: "", ...fields };
}

export function model(costUsd: number): Step["model"] {
    return { model: "gpt-6.1", inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd, toolCalls: [] };
}

// A listed run with only the summary fields and steps the data modules read.
export function catalogRunOf(id: string, startedAt: number, agents: string[], steps: Step[]): CatalogRun {
    const summary = { id, startedAt, agents } as RunDetail["summary"];
    const detail = { summary, steps } as RunDetail;
    const built = { runId: id, startedAt, steps, approvals: [], rawArgs: [] } as unknown as BuiltRun;
    return { built, detail };
}
