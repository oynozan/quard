import type { Mode, RuleResult } from "../call.ts";

export function limitResult(rule: string, mode: Mode, over: boolean): RuleResult {
    return over
        ? { guard: "limit", rule, decision: "block", mode, reason: "limit_reached" }
        : { guard: "limit", rule, decision: "allow", mode };
}
