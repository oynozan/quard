import type { FailResult, GuardCall, RuleResult } from "../../guards/call.ts";
import { runCounts } from "../../guards/limit/run-counts.ts";
import type { LimitOptions } from "../../guards/options.ts";
import type { Control } from "../../transport/link/control.ts";
import { countersOf, enforcedCap, refusal } from "./caps.ts";
import { addToRun } from "./run-add.ts";

// Adds the call to the per-run counters of a run that spans processes,
// which control keeps, as it keeps per-day counters
export async function countRuns(
    call: GuardCall,
    limits: readonly LimitOptions[],
    control: Control | undefined,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const counters = countersOf(limits, (options) => runCounts(call, options));
    if (counters.length === 0) {
        return undefined;
    }
    const adds = counters.map((found) => ({ counter: found.counter, add: found.add, max: enforcedCap(found) }));
    const totals = await addToRun(control, call.run, adds);
    const over = counters.flatMap((found, index) => found.caps.filter((cap) => (totals[index] as number) > cap.max));
    return refusal(call, over, checked, "limit_reached");
}
