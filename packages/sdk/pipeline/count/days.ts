import { MAX_DAY_COUNTS, newEventId, type CountMessage } from "@quard/shared";
import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { addDayUsed, dayCounts, dayUsed, takeDayUsed, utcDay } from "../../guards/limit/daily.ts";
import { fitsControl } from "../../guards/limit/run-counts.ts";
import type { LimitOptions } from "../../guards/options.ts";
import type { Control } from "../../transport/link/control.ts";
import { dayCounted } from "../../transport/link/queue.ts";
import { countersOf, enforcedCap, refusal, type Counter } from "./caps.ts";

// One call's counts, held by control, kept here until control has them, or held nowhere
type Taken = { tool: string; day: string; counters: Counter[]; at: "control" | "here" | "none" };

// No total passes the cap of a guard that blocks
function fits(counters: readonly Counter[], totals: readonly number[]): boolean {
    return counters.every((found, index) => (totals[index] as number) <= (enforcedCap(found) ?? Infinity));
}

// Counts here when control can't, adding nothing when a blocking cap is passed
function countHere(control: Control | undefined, taken: Taken): number[] {
    const { tool, day, counters } = taken;
    const totals = counters.map((found) => dayUsed(day, tool, found.counter) + found.add);
    if (fits(counters, totals)) {
        for (const { counter, add } of counters) {
            addDayUsed(day, tool, counter, add);
            control?.replays.keepCount({ day, tool, counter, add });
        }
        taken.at = "here";
    }
    return totals;
}

// Takes the counts of a refused call back here, and from control or from what waits for it
function giveBack(control: Control | undefined, taken: Taken): void {
    const { tool, day, counters, at } = taken;
    if (at === "none") {
        return;
    }
    taken.at = "none";
    counters.forEach(({ counter, add }) => takeDayUsed(day, tool, counter, add));
    if (control === undefined) {
        return;
    }
    if (at === "here") {
        counters.forEach(({ counter, add }) => control.replays.dropCount({ day, tool, counter, add }));
    } else {
        control.replays.takeBack(day, tool, counters);
    }
}

function countMessage({ tool, day, counters }: Taken): CountMessage {
    const counts = counters.map((found) => {
        const max = enforcedCap(found);
        return max === undefined
            ? { counter: found.counter, add: found.add }
            : { counter: found.counter, add: found.add, max };
    });
    return { type: "count", id: newEventId(), tool, day, counts };
}

// Asks control to add all of the call's counts or none, and counts here when no answer comes in time
async function countThere(control: Control, taken: Taken): Promise<number[]> {
    const { tool, day, counters } = taken;
    const noteTotals = control.replays.noteLater(day, tool, counters);
    const reply = await control.requests.request(countMessage(taken), {
        ms: control.replyMs,
        late: (late) => {
            const counted = dayCounted(late, counters.length);
            if (counted === undefined) {
                return;
            }
            if (counted.ok && taken.at === "none") {
                // Control counted a call that was refused meanwhile, so it gives the counts back
                control.replays.takeBack(day, tool, counters);
            } else if (counted.ok) {
                // Control counted them after all, so the local counts are not sent again
                counters.forEach(({ counter, add }) => control.replays.dropCount({ day, tool, counter, add }));
                taken.at = "control";
            }
            noteTotals(counted.used);
        },
    });
    const counted = dayCounted(reply, counters.length);
    if (counted !== undefined) {
        noteTotals(counted.used);
        taken.at = counted.ok ? "control" : "none";
        // A refused call was added to none of the counters
        return counters.map((found, index) => (counted.used[index] as number) + (counted.ok ? 0 : found.add));
    }
    return countHere(control, taken);
}

// One call's per-day counts, counted through control when they fit and it is there
function countTaken(control: Control | undefined, taken: Taken): Promise<number[]> | number[] {
    const fitsOne =
        taken.counters.length <= MAX_DAY_COUNTS && taken.counters.every((found) => fitsControl(found.counter));
    const linked = fitsOne ? control : undefined;
    return linked?.link.ready() === true ? countThere(linked, taken) : countHere(linked, taken);
}

// Adds to per-day counters, all or none, and returns each counter's new total
export async function dayTotals(
    control: Control | undefined,
    tool: string,
    counters: Counter[],
    day: string,
): Promise<number[]> {
    return countTaken(control, { tool, day, counters, at: "none" });
}

// Adds the call to its per-day counters, and puts the way to take them back in undo
export async function countDays(
    call: GuardCall,
    limits: readonly LimitOptions[],
    control: Control | undefined,
    checked: readonly RuleResult[],
    undo: Array<() => void> = [],
): Promise<FailResult | undefined> {
    const counters = countersOf(limits, (options) => dayCounts(call, options));
    if (counters.length === 0) {
        return undefined;
    }
    const taken: Taken = { tool: call.tool, day: utcDay(), counters, at: "none" };
    const fitsOne = counters.length <= MAX_DAY_COUNTS && counters.every((found) => fitsControl(found.counter));
    const linked = fitsOne ? control : undefined;
    const totals = await countTaken(control, taken);
    undo.push(() => giveBack(linked, taken));
    const over = counters.flatMap((found, index) => found.caps.filter((cap) => (totals[index] as number) > cap.max));
    return refusal(call, over, checked, "daily_limit_reached");
}
