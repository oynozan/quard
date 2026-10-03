import { newEventId, type CountMessage } from "@quard/shared";
import type { FailResult, GuardCall, Mode, RuleResult } from "../../guards/call.ts";
import { addDayUsed, dayCounts, dayUsed, noteDayUsed, utcDay } from "../../guards/limit/daily.ts";
import type { LimitOptions } from "../../guards/options.ts";
import type { Control } from "../../transport/link/control.ts";
import { recordDecision } from "../checks.ts";

type Cap = { rule: string; max: number; mode: Mode };

// One per-day counter of a call, with the cap of every guard on it
type Counter = { counter: string; add: number; caps: Cap[] };

// Each counter once per call, so two guards on one tool don't add twice
function countersOf(call: GuardCall, limits: readonly LimitOptions[]): Counter[] {
    const counters = new Map<string, Counter>();
    for (const options of limits) {
        const mode = options.mode ?? "block";
        for (const { rule, counter, add, max } of dayCounts(call, options)) {
            const found = counters.get(counter) ?? { counter, add, caps: [] };
            found.caps.push({ rule, max, mode });
            counters.set(counter, found);
        }
    }
    return [...counters.values()].filter((found) => found.add > 0);
}

// The smallest cap of the guards that block, which control enforces
function enforcedCap(found: Counter): number | undefined {
    const caps = found.caps.filter((cap) => cap.mode === "block").map((cap) => cap.max);
    return caps.length === 0 ? undefined : Math.min(...caps);
}

// Counts here when control can't, adding nothing when a blocking cap is passed
function countHere(control: Control | undefined, tool: string, counters: Counter[], day: string): number[] {
    const totals = counters.map((found) => dayUsed(day, tool, found.counter) + found.add);
    const refused = counters.some((found, index) => (totals[index] as number) > (enforcedCap(found) ?? Infinity));
    if (!refused) {
        for (const { counter, add } of counters) {
            addDayUsed(day, tool, counter, add);
            control?.replays.keepCount({ day, tool, counter, add });
        }
    }
    return totals;
}

// Asks control to count, and counts here when no answer comes in time
async function countThere(control: Control, tool: string, found: Counter, day: string): Promise<number> {
    const { counter, add } = found;
    const max = enforcedCap(found);
    const message: CountMessage = { type: "count", id: newEventId(), tool, counter, day, add };
    let kept = false;
    const reply = await control.requests.request(max === undefined ? message : { ...message, max }, {
        ms: control.replyMs,
        late: (late) => {
            if (late?.type !== "counted") {
                return;
            }
            noteDayUsed(day, tool, counter, late.used);
            // Control counted it after all, so the local count is not sent again
            if (kept && late.ok) {
                control.replays.dropCount({ day, tool, counter, add });
            }
        },
    });
    if (reply?.type === "counted") {
        noteDayUsed(day, tool, counter, reply.used);
        // A refused count was not added
        return reply.ok ? reply.used : reply.used + add;
    }
    const [total] = countHere(control, tool, [found], day) as [number];
    kept = total <= (max ?? Infinity);
    return total;
}

// Block mode refuses at the first cap passed, observe mode records it once
function refusal(call: GuardCall, over: readonly Cap[], checked: readonly RuleResult[]): FailResult | undefined {
    const flagged = new Set(checked.filter((done) => done.decision !== "allow").map((done) => done.rule));
    for (const { rule, mode } of over) {
        const result: FailResult = { guard: "limit", rule, decision: "block", mode, reason: "daily_limit_reached" };
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

// Adds the call to its per-day counters, which control shares across processes
export async function countDays(
    call: GuardCall,
    limits: readonly LimitOptions[],
    control: Control | undefined,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const counters = countersOf(call, limits);
    if (counters.length === 0) {
        return undefined;
    }
    const day = utcDay();
    const totals =
        control?.link.ready() === true
            ? await Promise.all(counters.map((found) => countThere(control, call.tool, found, day)))
            : countHere(control, call.tool, counters, day);
    const over = counters.flatMap((found, index) => found.caps.filter((cap) => (totals[index] as number) > cap.max));
    return refusal(call, over, checked);
}
