import { readAmount } from "../action/action.ts";
import type { GuardCall, Mode, RuleResult } from "../call.ts";
import type { LimitOptions } from "../options.ts";
import { checkDaily } from "./daily.ts";
import { checkFleet, type FleetView } from "./fleet.ts";

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

function checkRun(call: GuardCall, options: LimitOptions, mode: Mode): RuleResult[] {
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

// Per-run limits, per-day limits and the fleet check
export function checkLimit(call: GuardCall, options: LimitOptions, fleet?: FleetView): RuleResult[] {
    const mode = options.mode ?? "block";
    return [
        ...checkRun(call, options, mode),
        ...checkDaily(call, options, mode),
        ...checkFleet(call, options, mode, fleet),
    ];
}

// The rule names a limit guard's results use
export function limitRules(options: LimitOptions): string[] {
    const rules: Array<[unknown, string]> = [
        [options.maxCallsPerRun, "max-calls-per-run"],
        [options.maxAmountPerRun, "max-amount-per-run"],
        [options.maxCallsPerDay, "max-calls-per-day"],
        [options.maxAmountPerDay, "max-amount-per-day"],
        [options.fleetCheck, "fleet-check"],
    ];
    return rules.filter(([option]) => option !== undefined).map(([, rule]) => rule);
}

// Counts a call about to run, and returns a way to take the count back
export function countLimit(call: GuardCall, options: LimitOptions): () => void {
    const counters = call.run.counters;
    const added: Array<[string, number]> = [];
    const add = (key: string, amount: number) => {
        counters.set(key, (counters.get(key) ?? 0) + amount);
        added.push([key, amount]);
    };
    if (options.maxCallsPerRun !== undefined) {
        add(callsKey(call.tool), 1);
    }
    if (options.maxAmountPerRun !== undefined) {
        const amount = readAmount(call.input, options.maxAmountPerRun.field) ?? 0;
        // Observe mode lets bad amounts run, but they never lower the count
        add(amountKey(call.tool, options.maxAmountPerRun.field), Number.isFinite(amount) ? Math.max(0, amount) : 0);
    }
    return () => {
        for (const [key, amount] of added) {
            counters.set(key, (counters.get(key) as number) - amount);
        }
    };
}
