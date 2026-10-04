import { labelFor, type Label, type OriginOverrides } from "@quard/shared";
import { isGuardedTool, type RequestedCall } from "../context/registry.ts";
import type { RunState } from "../context/run.ts";
import type { Scope } from "../context/scope.ts";

// Tools whose output the agent framework writes itself, such as the
// message a handoff returns. Kept per run and per agent the tool was
// offered to, so another agent's tool of the same name is not affected.
const outputsByRun = new WeakMap<RunState, Map<string, Set<string>>>();

// Tools an agent framework runs itself, by run, such as handoffs and
// agents run as tools. They are not app tools, so there is nothing to wrap.
// An agent run as a tool is here but not above: its answer is outside content.
const toolsByRun = new WeakMap<RunState, Set<string>>();

export function markFrameworkTool(run: RunState, agent: string, name: string): void {
    const byAgent = outputsByRun.get(run) ?? new Map<string, Set<string>>();
    byAgent.set(agent, (byAgent.get(agent) ?? new Set<string>()).add(name));
    outputsByRun.set(run, byAgent);
}

export function addFrameworkTools(run: RunState, names: readonly string[]): void {
    const known = toolsByRun.get(run) ?? new Set<string>();
    names.forEach((name) => known.add(name));
    toolsByRun.set(run, known);
}

// The label of a result no guard labeled: system content when the
// framework wrote it, else unknown, like any unwrapped tool's. Within
// one agent a handoff wins over a tool of the same name.
export function unguardedOutputLabel(requested: RequestedCall | undefined, overrides: OriginOverrides): Label {
    const marks = requested === undefined ? undefined : outputsByRun.get(requested.scope.run)?.get(requested.agent);
    const own = requested !== undefined && marks?.has(requested.tool) === true;
    return labelFor(own ? "system" : "unknown", overrides);
}

// An app tool not wrapped with guard() can only be recorded, never stopped
export function warnsUnwrapped(scope: Scope, tool: string): boolean {
    return !isGuardedTool(tool) && toolsByRun.get(scope.run)?.has(tool) !== true;
}
