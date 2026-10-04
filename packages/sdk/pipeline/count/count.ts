import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { countLimit } from "../../guards/limit/limit.ts";
import { isShared } from "../../guards/limit/run-counts.ts";
import type { GuardOptions, LimitOptions } from "../../guards/options.ts";
import { activeControl } from "../../transport/link/active.ts";
import { countDays } from "./days.ts";
import { reportUse } from "./fleet.ts";
import { countRuns } from "./runs.ts";

// Per-run counts come first and at once, so parallel calls can't race past them
export async function countCall(
    call: GuardCall,
    list: readonly GuardOptions[],
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const limits = list.filter((options): options is LimitOptions => options.type === "limit");
    // A shared run's counters live in control; delegation stays here
    const shared = isShared(call.run);
    const undo = limits.map((options) => countLimit(call, options, !shared));
    const control = activeControl();
    let stop = shared ? await countRuns(call, limits, control, checked) : undefined;
    stop ??= await countDays(call, limits, control, checked);
    for (const options of limits) {
        stop ??= await reportUse(call, options, control, checked);
    }
    // A later refusal takes back local counts, but control only adds to a shared run's
    if (stop !== undefined) {
        undo.forEach((takeBack) => takeBack());
    }
    return stop;
}
