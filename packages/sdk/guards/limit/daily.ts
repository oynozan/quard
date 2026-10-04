import { readAmount } from "../action/action.ts";
import type { GuardCall, Mode, RuleResult } from "../call.ts";
import type { LimitOptions } from "../options.ts";

const DAY_MS = 86_400_000;

// Per-day counts as this process knows them, by UTC day
const days = new Map<string, Map<string, number>>();

export type DayCount = {
    rule: string;
    // "calls" or "amount:<field>", as control names its counters
    counter: string;
    add: number;
    max: number;
    // A negative or broken amount, which could lower the count
    bad: boolean;
};

export function utcDay(at: number = Date.now()): string {
    return new Date(at).toISOString().slice(0, 10);
}

function counterKey(tool: string, counter: string): string {
    return `${tool}\u0000${counter}`;
}

// One day's entry in a store that keeps only today and yesterday
export function dayEntry(store: Map<string, Map<string, number>>, day: string): Map<string, number> {
    let entry = store.get(day);
    if (entry === undefined) {
        entry = new Map();
        store.set(day, entry);
        const keep = [utcDay(), utcDay(Date.now() - DAY_MS)];
        for (const known of store.keys()) {
            if (!keep.includes(known)) {
                store.delete(known);
            }
        }
    }
    return entry;
}

const countsOf = (day: string) => dayEntry(days, day);

export function dayUsed(day: string, tool: string, counter: string): number {
    return days.get(day)?.get(counterKey(tool, counter)) ?? 0;
}

// The larger total wins, since control's can lack counts made here for it
export function noteDayUsed(day: string, tool: string, counter: string, used: number): void {
    const counts = countsOf(day);
    const key = counterKey(tool, counter);
    counts.set(key, Math.max(counts.get(key) ?? 0, used));
}

export function addDayUsed(day: string, tool: string, counter: string, add: number): void {
    const counts = countsOf(day);
    const key = counterKey(tool, counter);
    counts.set(key, (counts.get(key) ?? 0) + add);
}

// Takes back the counts of a call refused after it was counted
export function takeDayUsed(day: string, tool: string, counter: string, add: number): void {
    const counts = countsOf(day);
    const key = counterKey(tool, counter);
    counts.set(key, Math.max(0, (counts.get(key) ?? 0) - add));
}

export function clearDayCounts(): void {
    days.clear();
}

// The per-day counters one call adds to
export function dayCounts(call: GuardCall, options: LimitOptions): DayCount[] {
    const counts: DayCount[] = [];
    if (options.maxCallsPerDay !== undefined) {
        counts.push({ rule: "max-calls-per-day", counter: "calls", add: 1, max: options.maxCallsPerDay, bad: false });
    }
    if (options.maxAmountPerDay !== undefined) {
        const { field, max } = options.maxAmountPerDay;
        const amount = readAmount(call.input, field) ?? 0;
        const bad = !Number.isFinite(amount) || amount < 0;
        counts.push({ rule: "max-amount-per-day", counter: `amount:${field}`, add: bad ? 0 : amount, max, bad });
    }
    return counts;
}

export function dayResult(rule: string, mode: Mode, over: boolean): RuleResult {
    return over
        ? { guard: "limit", rule, decision: "block", mode, reason: "daily_limit_reached" }
        : { guard: "limit", rule, decision: "allow", mode };
}

// Checks per-day limits against the counts this process knows
export function checkDaily(call: GuardCall, options: LimitOptions, mode: Mode): RuleResult[] {
    const day = utcDay();
    return dayCounts(call, options).map((count) =>
        dayResult(count.rule, mode, count.bad || dayUsed(day, call.tool, count.counter) + count.add > count.max),
    );
}
