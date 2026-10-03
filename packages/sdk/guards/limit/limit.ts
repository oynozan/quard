import { readAmount } from "../action/action.ts";
import type { GuardCall, Mode, RuleResult } from "../call.ts";
import type { LimitOptions } from "../options.ts";

function callsKey(tool: string): string {
    return `calls:${tool}`;
}

function amountKey(tool: string, field: string): string {
    return `amount:${tool}:${field}`;
}

function result(rule: string, mode: Mode, over: boolean): RuleResult {
    return over
        ? { guard: "limit", rule, decision: "block", mode, reason: "limit_reached" }
        : { guard: "limit", rule, decision: "allow", mode };
}

// Per-run limits. Per-day and fleet limits need the backend (M3).
export function checkLimit(call: GuardCall, options: LimitOptions): RuleResult[] {
    const mode = options.mode ?? "block";
    const counters = call.run.counters;
    const results: RuleResult[] = [];
    if (options.maxCallsPerRun !== undefined) {
        const used = counters.get(callsKey(call.tool)) ?? 0;
        results.push(result("max-calls-per-run", mode, used + 1 > options.maxCallsPerRun));
    }
    if (options.maxAmountPerRun !== undefined) {
        const { field, max } = options.maxAmountPerRun;
        const amount = readAmount(call.input, field) ?? 0;
        const used = counters.get(amountKey(call.tool, field)) ?? 0;
        // A negative or broken amount could lower the count, so it is blocked
        const bad = !Number.isFinite(amount) || amount < 0;
        results.push(result("max-amount-per-run", mode, bad || used + amount > max));
    }
    return results;
}

// Counts a call that is about to run
export function countLimit(call: GuardCall, options: LimitOptions): void {
    const counters = call.run.counters;
    if (options.maxCallsPerRun !== undefined) {
        counters.set(callsKey(call.tool), (counters.get(callsKey(call.tool)) ?? 0) + 1);
    }
    if (options.maxAmountPerRun !== undefined) {
        const key = amountKey(call.tool, options.maxAmountPerRun.field);
        const amount = readAmount(call.input, options.maxAmountPerRun.field) ?? 0;
        // Observe mode lets bad amounts run, but they never lower the count
        counters.set(key, (counters.get(key) ?? 0) + (Number.isFinite(amount) ? Math.max(0, amount) : 0));
    }
}
