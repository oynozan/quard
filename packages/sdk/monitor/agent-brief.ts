import { extractValues, labelFor, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import type { Scope } from "../context/scope.ts";
import { vouchedLabel } from "../labels/vouched-label.ts";

// The label of the brief an agent run as a tool gets as its user input,
// by the frame the agent runs in
const briefs = new WeakMap<Scope, Label>();

// The brief is the caller's words, with the run's context label at the
// call. A team's override for the caller's origin still wins.
export function markBrief(frame: Scope, caller: string): void {
    const origin = `agent:${caller}`;
    const { trust, sensitivity, flagged } = vouchedLabel(frame.run.index);
    const overrides = getConfig().origins;
    const own = Object.hasOwn(overrides, origin) ? overrides[origin] : undefined;
    briefs.set(frame, labelFor(origin, { [origin]: { trust, sensitivity, ...own } }, flagged ? ["flagged"] : []));
}

// The label of a user input that is a brief. Value keys the run's index
// does not hold yet are the caller model's own words, so in a trusted
// brief they stay model-generated.
export function briefLabel(scope: Scope, text: string): Label | undefined {
    const label = briefs.get(scope);
    if (label?.trust === "trusted") {
        const index = scope.run.index;
        const keys = extractValues(text).flatMap((value) => value.keys);
        index.markMadeUp(keys.filter((key) => index.lookup([key]).length === 0));
    }
    return label;
}
