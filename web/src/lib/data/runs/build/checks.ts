import { rulesHashAt } from "../../guards/apps";
import { evaluateGuard, evaluateSource, type CallFacts, type Verdict } from "../../guards/evaluate";
import { RUN_LIMITS } from "../../guards/limits";
import { inOutage, OUTAGE_REASON } from "../../guards/outage";
import { labelFor } from "../../labels/origins";
import type { GuardSpec, ToolSpec } from "../../guards/tools";
import type { BuildState } from "./state";
import type { GuardMode, GuardType, Outcome } from "../../types";
import type { SourceScan, Step } from "../types";

// A script can force what a rule decided, by rule name.
export type DecisionOverride = {
    outcome?: Outcome;
    reason?: string;
    mode?: GuardMode | null;
    findings?: string[];
    jev?: number | null;
    degraded?: boolean;
};

export type Overrides = Record<string, DecisionOverride>;

// Pipeline order for the checks that act before the call. Permission comes first.
const ORDER: Record<GuardType, number> = { permission: 0, limit: 1, action: 2, egress: 3, approval: 4, source: 5 };

function ruleHash(rule: string, guard: GuardSpec): string {
    return RUN_LIMITS.find((limit) => limit.rule === rule)?.hash ?? guard.hash;
}

function apply(base: Verdict, override: DecisionOverride): Verdict {
    return {
        rule: base.rule,
        outcome: override.outcome ?? base.outcome,
        reason: override.reason ?? base.reason,
        mode: override.mode !== undefined ? override.mode : base.mode,
    };
}

function record(
    s: BuildState,
    agent: string,
    call: Step,
    guard: GuardSpec,
    verdict: Verdict,
    override: DecisionOverride,
    scan: SourceScan | null,
): Step {
    const step = s.step(agent, "guard_decision", verdict.rule, call.id, s.int(1, 6));
    step.detail = verdict.reason;
    step.guard = {
        guard: guard.type,
        tool: call.name,
        outcome: verdict.outcome,
        mode: verdict.mode,
        rule: verdict.rule,
        ruleHash: ruleHash(verdict.rule, guard),
        rulesHash: rulesHashAt(agent, step.startedAt),
        reason: verdict.reason,
        degraded: override.degraded ?? inOutage(step.startedAt),
        scan,
    };
    if (verdict.mode !== "observe" && verdict.outcome === "block") step.status = "blocked";
    s.wait(step.durationMs);
    return step;
}

// Runs limit, action, egress and approval checks. The strictest enforced result wins.
export function runChecks(
    s: BuildState,
    agent: string,
    call: Step,
    spec: ToolSpec,
    facts: CallFacts,
    overrides: Overrides,
): "allow" | "ask" | "block" {
    let result: "allow" | "ask" | "block" = "allow";
    const checks = spec.guards.filter((g) => g.type !== "source").sort((a, b) => ORDER[a.type] - ORDER[b.type]);
    for (const guard of checks) {
        s.wait(s.int(1, 3));
        const base = evaluateGuard(guard, facts);
        const override = overrides[base.rule] ?? overrides[guard.rule] ?? {};
        let verdict = apply(base, override);
        // While the backend is down, an ask blocks after retrying for 30 s.
        if (verdict.outcome === "ask" && verdict.mode !== "observe" && inOutage(s.clock)) {
            s.wait(30_000);
            verdict = { ...verdict, outcome: "block", reason: OUTAGE_REASON };
        }
        record(s, agent, call, guard, verdict, override, null);
        if (verdict.mode === "observe") continue;
        if (verdict.outcome === "block") result = "block";
        else if (verdict.outcome === "ask" && result === "allow") result = "ask";
    }
    return result;
}

// Labels, scans and checks what a source tool brought back, after it returns.
export function runSourceCheck(
    s: BuildState,
    agent: string,
    call: Step,
    spec: ToolSpec,
    origin: string,
    overrides: Overrides,
): Outcome | null {
    const guard = spec.guards.find((g) => g.type === "source");
    if (!guard) return null;
    s.wait(s.int(2, 30));
    const override = overrides[guard.rule] ?? {};
    const verdict = apply(evaluateSource(guard, origin, spec.hosted), override);
    // Jev only ever sees content labeled public, and never hosted search pages.
    const isPublic = labelFor(origin).sensitivity === "public";
    const jev = spec.hosted || !isPublic ? null : (override.jev ?? Math.round(s.float(0.01, 0.16) * 100) / 100);
    const scan: SourceScan = { scanned: !spec.hosted, findings: override.findings ?? [], jevScore: jev };
    record(s, agent, call, guard, verdict, override, scan);
    return verdict.mode === "observe" ? "pass" : verdict.outcome;
}
