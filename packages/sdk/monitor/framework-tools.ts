import { labelFor, type Label, type OriginOverrides } from "@quard/shared";
import type { RequestedCall } from "../context/registry.ts";
import type { RunState } from "../context/run.ts";

// Tools whose output the agent framework writes itself, such as the
// message a handoff returns. Kept per run, so other runs are not affected.
const byRun = new WeakMap<RunState, Set<string>>();

export function markFrameworkTool(run: RunState, name: string): void {
    const names = byRun.get(run) ?? new Set<string>();
    names.add(name);
    byRun.set(run, names);
}

// The label of a result no guard labeled: system content when the
// framework wrote it, else unknown, like any unwrapped tool's
export function unguardedOutputLabel(requested: RequestedCall | undefined, overrides: OriginOverrides): Label {
    const own = requested !== undefined && byRun.get(requested.scope.run)?.has(requested.tool) === true;
    return labelFor(own ? "system" : "unknown", overrides);
}
