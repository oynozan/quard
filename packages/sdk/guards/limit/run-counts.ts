import type { RunState } from "../../context/run.ts";
import { readAmount } from "../action/action.ts";
import type { GuardCall } from "../call.ts";
import type { LimitOptions } from "../options.ts";

// The counters of one run, named as control names them: "steps",
// "cost", "calls:<tool>" and "amount:<tool>:<field>"

// Runs that span processes, whose counters live in control
const shared = new WeakSet<RunState>();

// Control takes counter names up to this long
const MAX_COUNTER = 200;

export type RunLimitCount = {
    rule: string;
    counter: string;
    add: number;
    max: number;
};

export function callsKey(tool: string): string {
    return `calls:${tool}`;
}

export function amountKey(tool: string, field: string): string {
    return `amount:${tool}:${field}`;
}

export function isShared(run: RunState): boolean {
    return shared.has(run);
}

// False when the run was already shared
export function markShared(run: RunState): boolean {
    if (shared.has(run)) {
        return false;
    }
    shared.add(run);
    return true;
}

// A counter with a longer name stays in this process
export function fitsControl(counter: string): boolean {
    return counter.length <= MAX_COUNTER;
}

// The run's total as this process knows it
export function runUsed(run: RunState, counter: string): number {
    if (counter === "steps") {
        return run.modelCalls;
    }
    if (counter === "cost") {
        return run.costUsd;
    }
    return run.counters.get(counter) ?? 0;
}

function setUsed(run: RunState, counter: string, used: number): void {
    if (counter === "steps") {
        run.modelCalls = used;
    } else if (counter === "cost") {
        run.costUsd = used;
    } else {
        run.counters.set(counter, used);
    }
}

// Run counters only grow, so the larger total wins
export function noteRunUsed(run: RunState, counter: string, used: number): void {
    setUsed(run, counter, Math.max(runUsed(run, counter), used));
}

export function addRunUsed(run: RunState, counter: string, add: number): void {
    setUsed(run, counter, runUsed(run, counter) + add);
}

// What the run counted so far, for control to start from
export function runTotals(run: RunState): Array<{ counter: string; add: number }> {
    const totals: Array<[string, number]> = [["steps", run.modelCalls], ["cost", run.costUsd], ...run.counters];
    return totals
        .filter(([counter, add]) => add > 0 && fitsControl(counter))
        .map(([counter, add]) => ({ counter, add }));
}

// The per-run counters one call adds to. Bad amounts add nothing; the
// checks before the call already caught them.
export function runCounts(call: GuardCall, options: LimitOptions): RunLimitCount[] {
    const counts: RunLimitCount[] = [];
    if (options.maxCallsPerRun !== undefined) {
        const max = options.maxCallsPerRun;
        counts.push({ rule: "max-calls-per-run", counter: callsKey(call.tool), add: 1, max });
    }
    if (options.maxAmountPerRun !== undefined) {
        const { field, max } = options.maxAmountPerRun;
        const amount = readAmount(call.input, field) ?? 0;
        const add = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        counts.push({ rule: "max-amount-per-run", counter: amountKey(call.tool, field), add, max });
    }
    return counts;
}
