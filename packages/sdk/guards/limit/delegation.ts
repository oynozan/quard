import { valueAtPath } from "@quard/shared";
import type { RunLimits } from "../../core/config.ts";
import type { RunState } from "../../context/run.ts";
import type { GuardCall, RuleResult } from "../call.ts";
import { limitResult } from "./result.ts";

// The agent the call delegates to, when the argument names one
function targetOf(call: GuardCall, delegateTo: string): string | undefined {
    const value = valueAtPath(call.input, delegateTo);
    return typeof value === "string" && value !== "" ? value : undefined;
}

// Both directions of a pair share one key
function pairKey(a: string, b: string): string {
    return JSON.stringify(a < b ? [a, b] : [b, a]);
}

// The first handoff is turn 1, and each change of direction adds a turn
function turnsAfter(run: RunState, from: string, to: string): number {
    const seen = run.turns.get(pairKey(from, to));
    if (seen === undefined) {
        return 1;
    }
    return seen.lastFrom === from ? seen.turns : seen.turns + 1;
}

function helpersAfter(run: RunState, from: string, to: string): number {
    const helpers = run.helpers.get(from);
    if (helpers === undefined) {
        return 1;
    }
    return helpers.has(to) ? helpers.size : helpers.size + 1;
}

// Depth, fan-out and loops for a send or delegate tool. Without a
// target, only depth can be checked.
export function checkDelegation(call: GuardCall, delegateTo: string, limits: RunLimits): RuleResult[] {
    const { mode } = limits;
    const results = [limitResult("max-depth", mode, call.depth + 1 > limits.depth)];
    const target = targetOf(call, delegateTo);
    if (target !== undefined) {
        results.push(limitResult("max-fan-out", mode, helpersAfter(call.run, call.agent, target) > limits.fanOut));
        results.push(limitResult("max-loops", mode, turnsAfter(call.run, call.agent, target) > limits.loops));
    }
    return results;
}

// Records the helper and the turn of a call that is about to run, and
// returns a way to take them back if control stops the call after all
export function countDelegation(call: GuardCall, delegateTo: string): (() => void) | undefined {
    const target = targetOf(call, delegateTo);
    if (target === undefined) {
        return undefined;
    }
    const { run, agent } = call;
    const key = pairKey(agent, target);
    const before = run.turns.get(key);
    const helpers = run.helpers.get(agent) ?? new Set<string>();
    const added = !helpers.has(target);
    helpers.add(target);
    run.helpers.set(agent, helpers);
    run.turns.set(key, { lastFrom: agent, turns: turnsAfter(run, agent, target) });
    return () => {
        if (added) {
            helpers.delete(target);
        }
        if (before === undefined) {
            run.turns.delete(key);
        } else {
            run.turns.set(key, before);
        }
    };
}
