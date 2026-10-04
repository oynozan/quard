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
    // Checks that must still pass once the call is counted
    after: () => FailResult | undefined = () => undefined,
): Promise<FailResult | undefined> {
    const limits = list.filter((options): options is LimitOptions => options.type === "limit");
    // A shared run's counters live in control; delegation stays here
    const shared = isShared(call.run);
    const undo = limits.map((options) => countLimit(call, options, !shared));
    const control = activeControl();
    let stop = shared ? await countRuns(call, limits, control, checked) : undefined;
    stop ??= await countDays(call, limits, control, checked, undo);
    for (const options of limits) {
        stop ??= await reportUse(call, options, control, checked);
    }
    stop ??= after();
    // A refusal takes back the per-day counts and local ones, but control keeps a shared run's
    if (stop !== undefined) {
        undo.forEach((takeBack) => takeBack());
    }
    return stop;
}
