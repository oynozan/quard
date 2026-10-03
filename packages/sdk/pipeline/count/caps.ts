import type { ReasonCode } from "@quard/shared";
import type { FailResult, GuardCall, Mode, RuleResult } from "../../guards/call.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { recordDecision } from "../checks.ts";

export type Cap = { rule: string; max: number; mode: Mode };

// One counter of a call, with the cap of every guard on it
export type Counter = { counter: string; add: number; caps: Cap[] };

export type CapCount = { rule: string; counter: string; add: number; max: number };

// Each counter once per call, so two guards on one tool don't add twice
export function countersOf(
    limits: readonly LimitOptions[],
    countsOf: (options: LimitOptions) => CapCount[],
): Counter[] {
    const counters = new Map<string, Counter>();
    for (const options of limits) {
        const mode = options.mode ?? "block";
        for (const { rule, counter, add, max } of countsOf(options)) {
            const found = counters.get(counter) ?? { counter, add, caps: [] };
            found.caps.push({ rule, max, mode });
            counters.set(counter, found);
        }
    }
    return [...counters.values()].filter((found) => found.add > 0);
}

// The smallest cap of the guards that block, which control enforces
export function enforcedCap(found: Counter): number | undefined {
    const caps = found.caps.filter((cap) => cap.mode === "block").map((cap) => cap.max);
    return caps.length === 0 ? undefined : Math.min(...caps);
}

// Block mode refuses at the first cap passed, observe mode records it once
export function refusal(
    call: GuardCall,
    over: readonly Cap[],
    checked: readonly RuleResult[],
    reason: ReasonCode,
): FailResult | undefined {
    const flagged = new Set(checked.filter((done) => done.decision !== "allow").map((done) => done.rule));
    for (const { rule, mode } of over) {
        const result: FailResult = { guard: "limit", rule, decision: "block", mode, reason };
        if (mode === "block") {
            recordDecision(call, result);
            return result;
        }
        if (!flagged.has(rule)) {
            flagged.add(rule);
            recordDecision(call, result);
        }
    }
    return undefined;
}
