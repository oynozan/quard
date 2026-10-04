import { MAX_DAY_COUNTS, newEventId, type CountMessage } from "@quard/shared";
import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { addDayUsed, dayCounts, dayUsed, noteDayUsed, utcDay } from "../../guards/limit/daily.ts";
import { fitsControl } from "../../guards/limit/run-counts.ts";
import type { LimitOptions } from "../../guards/options.ts";
import type { Control } from "../../transport/link/control.ts";
import { dayCounted } from "../../transport/link/queue.ts";
import { countersOf, enforcedCap, refusal, type Counter } from "./caps.ts";

// No total passes the cap of a guard that blocks
function fits(counters: readonly Counter[], totals: readonly number[]): boolean {
    return counters.every((found, index) => (totals[index] as number) <= (enforcedCap(found) ?? Infinity));
}

function noteTotals(day: string, tool: string, counters: readonly Counter[], used: readonly number[]): void {
    counters.forEach(({ counter }, index) => noteDayUsed(day, tool, counter, used[index] as number));
}

// Counts here when control can't, adding nothing when a blocking cap is passed
function countHere(control: Control | undefined, tool: string, counters: Counter[], day: string): number[] {
    const totals = counters.map((found) => dayUsed(day, tool, found.counter) + found.add);
    if (fits(counters, totals)) {
        for (const { counter, add } of counters) {
            addDayUsed(day, tool, counter, add);
            control?.replays.keepCount({ day, tool, counter, add });
        }
    }
    return totals;
}

function countMessage(tool: string, counters: readonly Counter[], day: string): CountMessage {
    const counts = counters.map((found) => {
        const max = enforcedCap(found);
        return max === undefined
            ? { counter: found.counter, add: found.add }
            : { counter: found.counter, add: found.add, max };
    });
    return { type: "count", id: newEventId(), tool, day, counts };
}

// Asks control to add all of the call's counts or none, and counts here when no answer comes in time
async function countThere(control: Control, tool: string, counters: Counter[], day: string): Promise<number[]> {
    let kept = false;
    const reply = await control.requests.request(countMessage(tool, counters, day), {
        ms: control.replyMs,
        late: (late) => {
            const counted = dayCounted(late, counters.length);
            if (counted === undefined) {
                return;
            }
            noteTotals(day, tool, counters, counted.used);
            // Control counted them after all, so the local counts are not sent again
            if (kept && counted.ok) {
                counters.forEach(({ counter, add }) => control.replays.dropCount({ day, tool, counter, add }));
            }
        },
    });
    const counted = dayCounted(reply, counters.length);
    if (counted !== undefined) {
        noteTotals(day, tool, counters, counted.used);
        // A refused call was added to none of the counters
        return counters.map((found, index) => (counted.used[index] as number) + (counted.ok ? 0 : found.add));
    }
    const totals = countHere(control, tool, counters, day);
    kept = fits(counters, totals);
    return totals;
}

// Adds the call to its per-day counters, shared through control when they fit in one message
export async function countDays(
    call: GuardCall,
    limits: readonly LimitOptions[],
    control: Control | undefined,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const counters = countersOf(limits, (options) => dayCounts(call, options));
    if (counters.length === 0) {
        return undefined;
    }
    const day = utcDay();
    const fitsOne = counters.length <= MAX_DAY_COUNTS && counters.every((found) => fitsControl(found.counter));
    const linked = fitsOne ? control : undefined;
    const totals =
        linked?.link.ready() === true
            ? await countThere(linked, call.tool, counters, day)
            : countHere(linked, call.tool, counters, day);
    const over = counters.flatMap((found, index) => found.caps.filter((cap) => (totals[index] as number) > cap.max));
    return refusal(call, over, checked, "daily_limit_reached");
}
