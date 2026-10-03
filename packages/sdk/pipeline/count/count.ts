import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { countLimit } from "../../guards/limit/limit.ts";
import type { GuardOptions, LimitOptions } from "../../guards/options.ts";
import { activeControl } from "../../transport/link/active.ts";
import { countDays } from "./days.ts";
import { reportUse } from "./fleet.ts";

// Per-run counts come first and at once, so parallel calls can't race past them
export async function countCall(
    call: GuardCall,
    list: readonly GuardOptions[],
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const limits = list.filter((options): options is LimitOptions => options.type === "limit");
    const undo = limits.map((options) => countLimit(call, options));
    const control = activeControl();
    let stop = await countDays(call, limits, control, checked);
    for (const options of limits) {
        stop ??= await reportUse(call, options, control, checked);
    }
    if (stop !== undefined) {
        undo.forEach((takeBack) => takeBack());
    }
    return stop;
}
