import type { RunDecision, RunDetail as StoredRun, RunLabel, RunStep } from "@quard/db";
import { contextOf, isInfluenced } from "../../labels/context";
import type { GuardType, Label, Outcome, StepKind } from "../../types";
import type { Step } from "../types";
import { argsOf } from "./values";

const GUARDS: ReadonlySet<string> = new Set<GuardType>([
    "source",
    "action",
    "approval",
    "egress",
    "limit",
    "permission",
]);

// Every call passes a permission check, so only the ones that stopped something get a row
function shown(decision: RunDecision): boolean {
    return GUARDS.has(decision.guard) && (decision.guard !== "permission" || decision.decision !== "allow");
}

type Call = { callId: string; name: string };
type Usage = { inputTokens: number; cachedTokens: number; outputTokens: number };
type ToolDetail = { arguments: unknown; error: string | null; keys: string[] };

const ms = (date: Date) => date.getTime();
// At the same moment a model call comes first, then a tool call, then its checks
const rank = (kind: StepKind) => (kind === "model_call" ? 0 : kind === "tool_call" ? 1 : 2);
const labelOf = (row: RunLabel): Label => ({ origin: row.origin, trust: row.trust, sensitivity: row.sensitivity });

function callsOf(detail: unknown): Call[] {
    const calls = (detail as { toolCalls?: unknown } | null)?.toolCalls;
    if (!Array.isArray(calls)) return [];
    return calls.flatMap((call: { callId?: unknown; name?: unknown }) =>
        typeof call.callId === "string" && typeof call.name === "string"
            ? [{ callId: call.callId, name: call.name }]
            : [],
    );
}

// Token counts and cost as stored with a model call; cost is null when the price was unknown
function usageOf(detail: unknown): { usage: Usage | null; costUsd: number | null } {
    const value = (detail ?? {}) as { usage?: Partial<Usage> | null; costUsd?: unknown };
    const usage = value.usage;
    const complete =
        typeof usage?.inputTokens === "number" &&
        typeof usage.cachedTokens === "number" &&
        typeof usage.outputTokens === "number";
    return {
        usage: complete ? (usage as Usage) : null,
        costUsd: typeof value.costUsd === "number" ? value.costUsd : null,
    };
}

function toolDetailOf(detail: unknown): ToolDetail {
    const value = (detail ?? {}) as { arguments?: unknown; error?: unknown; keys?: unknown };
    return {
        arguments: value.arguments,
        error: typeof value.error === "string" ? value.error : null,
        keys: Array.isArray(value.keys) ? value.keys.filter((key): key is string => typeof key === "string") : [],
    };
}

function readBefore(labels: RunLabel[], time: number): RunLabel[] {
    return labels.filter((label) => ms(label.at) < time);
}

const base = {
    args: [],
    output: null,
    model: null,
    guard: null,
    link: null,
    memory: null,
    approval: null,
    hosted: false,
};

// A model call ends at `at`. It read what came before it, plus its own input.
function modelStep(step: RunStep, labels: RunLabel[]): Step {
    const startedAt = ms(step.at) - step.durationMs;
    const read = labels.filter((label) => ms(label.at) < startedAt || label.stepId === step.stepId);
    const context = contextOf(read.map(labelOf));
    const names = callsOf(step.detail).map((call) => call.name);
    const { usage, costUsd } = usageOf(step.detail);
    return {
        ...base,
        id: step.stepId,
        parentId: step.parentStepId,
        agent: step.agent,
        kind: "model_call",
        name: step.name,
        startedAt,
        durationMs: step.durationMs,
        status: step.status === "error" ? "error" : "ok",
        context,
        influenced: isInfluenced(context),
        detail: names.length > 0 ? `Asked for ${names.join(", ")}` : "Answered",
        model: {
            model: step.name,
            inputTokens: usage?.inputTokens ?? 0,
            cachedTokens: usage?.cachedTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
            costUsd: costUsd ?? 0,
            // A failed call is not billed, so its missing price does not matter
            costKnown: costUsd !== null || step.status === "error",
            toolCalls: names,
        },
        error: step.status === "error" ? "The model call failed." : null,
    };
}

// A tool call starts at its first check. Its own output comes after it, so it is not part of its context.
function toolStep(step: RunStep, run: StoredRun, firstCheck: Map<string, number>, owner: Map<string, string>): Step {
    const end = ms(step.at);
    const startedAt = Math.min(end - step.durationMs, firstCheck.get(step.stepId) ?? end);
    const before = readBefore(run.labels, startedAt);
    const detail = toolDetailOf(step.detail);
    const generated = new Set(
        run.decisions
            .filter((d) => d.stepId === step.stepId && d.reason === "value_model_generated" && d.field !== null)
            .map((d) => String(d.field)),
    );
    const args = argsOf(detail.arguments, detail.keys, before, generated);
    const output = run.labels.find((label) => label.stepId === step.stepId);
    const first = args[0];
    return {
        ...base,
        id: step.stepId,
        parentId: step.callId === null ? null : (owner.get(step.callId) ?? null),
        agent: step.agent,
        kind: "tool_call",
        name: step.name,
        startedAt,
        durationMs: end - startedAt,
        status: step.status === "blocked" ? "blocked" : step.status === "error" ? "error" : "ok",
        context: contextOf(before.map(labelOf)),
        influenced: step.influenced,
        detail: detail.error ?? (first ? `${first.name} ${first.value}` : ""),
        args,
        output: output ? { label: labelOf(output), summary: "" } : null,
        error: detail.error,
    };
}

function guardStep(decision: RunDecision, labels: RunLabel[]): Step {
    const at = ms(decision.at);
    const context = contextOf(readBefore(labels, at).map(labelOf));
    const guard = decision.guard as GuardType;
    const reason = decision.reason ?? "";
    return {
        ...base,
        id: decision.eventId,
        parentId: decision.stepId,
        agent: decision.agent,
        kind: "guard_decision",
        name: decision.rule,
        startedAt: at,
        durationMs: 0,
        status: decision.enforced && decision.decision === "block" ? "blocked" : "ok",
        context,
        influenced: isInfluenced(context),
        detail: reason ? reason.replaceAll(",", ", ").replaceAll("_", " ") : decision.decision,
        guard: {
            guard,
            tool: decision.tool,
            outcome: decision.decision as Outcome,
            mode: guard === "approval" ? null : decision.mode,
            rule: decision.rule,
            ruleHash: "",
            rulesHash: "",
            reason,
            degraded: false,
            scan:
                guard === "source"
                    ? { scanned: true, findings: reason ? reason.split(",") : [], jevScore: null }
                    : null,
        },
        error: null,
    };
}

// Model calls, tool calls and guard decisions in time order. A call comes before its own checks.
export function buildSteps(run: StoredRun): Step[] {
    const firstCheck = new Map<string, number>();
    for (const decision of run.decisions) {
        if (!firstCheck.has(decision.stepId)) firstCheck.set(decision.stepId, ms(decision.at));
    }
    const owner = new Map<string, string>();
    for (const step of run.steps) {
        for (const call of step.kind === "model_call" ? callsOf(step.detail) : []) owner.set(call.callId, step.stepId);
    }
    const steps = [
        ...run.steps.map((step) =>
            step.kind === "model_call" ? modelStep(step, run.labels) : toolStep(step, run, firstCheck, owner),
        ),
        ...run.decisions.filter(shown).map((d) => guardStep(d, run.labels)),
    ];
    return steps.sort((a, b) => a.startedAt - b.startedAt || rank(a.kind) - rank(b.kind));
}
