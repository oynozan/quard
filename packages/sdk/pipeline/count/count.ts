import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { countLimit } from "../../guards/limit/limit.ts";
import { isShared } from "../../guards/limit/run-counts.ts";
import type { GuardOptions, LimitOptions } from "../../guards/options.ts";
import { activeControl } from "../../transport/link/active.ts";
import { countDays } from "./days.ts";
import { reportUse } from "./fleet.ts";
import { countRuns } from "./runs.ts";

// Per-run counts of a local run come first and at once, so parallel
// calls can't race past them, and are taken back when a later step
// refuses. A shared run's per-run counts live in control, which can't
// take them back, so they come last, after every step that can refuse.
// Per-day counts stay counted when a later step refuses the call: the
// fleet check, or a shared run's per-run limit.
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
    let stop = await countDays(call, limits, control, checked);
    for (const options of limits) {
        stop ??= await reportUse(call, options, control, checked);
    }
    if (shared) {
        stop ??= await countRuns(call, limits, control, checked);
    }
    if (stop !== undefined) {
        undo.forEach((takeBack) => takeBack());
    }
    return stop;
}
