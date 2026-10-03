import { newEventId, type CountMessage } from "@quard/shared";
import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { addDayUsed, dayCounts, dayUsed, noteDayUsed, utcDay } from "../../guards/limit/daily.ts";
import type { LimitOptions } from "../../guards/options.ts";
import type { Control } from "../../transport/link/control.ts";
import { countersOf, enforcedCap, refusal, type Counter } from "./caps.ts";

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

// Adds the call to its per-day counters, which control shares across processes
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
    const totals =
        control?.link.ready() === true
            ? await Promise.all(counters.map((found) => countThere(control, call.tool, found, day)))
            : countHere(control, call.tool, counters, day);
    const over = counters.flatMap((found, index) => found.caps.filter((cap) => (totals[index] as number) > cap.max));
    return refusal(call, over, checked, "daily_limit_reached");
}
