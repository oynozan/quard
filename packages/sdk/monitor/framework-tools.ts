import { labelFor, type Label, type OriginOverrides } from "@quard/shared";
import { isGuardedTool, type RequestedCall } from "../context/registry.ts";
import type { RunState } from "../context/run.ts";
import type { Scope } from "../context/scope.ts";

// Tools whose output the agent framework writes itself, such as the
// message a handoff returns. Kept per run, so other runs are not affected.
const outputsByRun = new WeakMap<RunState, Set<string>>();

// Tools an agent framework runs itself, by run, such as handoffs and
// agents run as tools. They are not app tools, so there is nothing to wrap.
// An agent run as a tool is here but not above: its answer is outside content.
const toolsByRun = new WeakMap<RunState, Set<string>>();

function add(map: WeakMap<RunState, Set<string>>, run: RunState, names: readonly string[]): void {
    const known = map.get(run) ?? new Set<string>();
    names.forEach((name) => known.add(name));
    map.set(run, known);
}

export function markFrameworkTool(run: RunState, name: string): void {
    add(outputsByRun, run, [name]);
}

export function addFrameworkTools(run: RunState, names: readonly string[]): void {
    add(toolsByRun, run, names);
}

// The label of a result no guard labeled: system content when the
// framework wrote it, else unknown, like any unwrapped tool's
export function unguardedOutputLabel(requested: RequestedCall | undefined, overrides: OriginOverrides): Label {
    const own = requested !== undefined && outputsByRun.get(requested.scope.run)?.has(requested.tool) === true;
    return labelFor(own ? "system" : "unknown", overrides);
}

// An app tool not wrapped with guard() can only be recorded, never stopped
export function warnsUnwrapped(scope: Scope, tool: string): boolean {
    return !isGuardedTool(tool) && toolsByRun.get(scope.run)?.has(tool) !== true;
}
