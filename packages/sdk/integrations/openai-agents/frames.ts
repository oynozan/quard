import { newStepId } from "@quard/shared";
import { now, record } from "../../core/recorder.ts";
import { childScope, type Scope } from "../../context/scope.ts";

// A frame is the scope of one Agents SDK run() call. Its agent follows
// the framework: a handoff switches it, and an agent run as a tool gets
// a frame of its own.
const frames = new WeakSet<Scope>();

function frame(scope: Scope): Scope {
    frames.add(scope);
    return scope;
}

export function isFrame(scope: Scope): boolean {
    return frames.has(scope);
}

// Records that work moved from the frame's agent to another one, with
// the run's context label at that moment. The step it moved from is the
// new agent's parent step.
function recordHandoff(from: Scope, to: string, via: "handoff" | "tool"): void {
    from.lastStepId ??= newStepId();
    const label = from.run.index.context();
    record({
        type: "handoff",
        runId: from.run.runId,
        stepId: from.lastStepId,
        agent: from.agent,
        at: now(),
        to,
        via,
        trust: label.trust,
        sensitivity: label.sensitivity,
    });
}

// A top-level run() inside a quard scope: the same run, with the agent
// the framework starts with. A copy, so a handoff leaves the scope alone.
export function topFrame(parent: Scope, agent: string): Scope {
    return frame({ ...parent, agent });
}

// A run() inside another run's tool call, as Agent.asTool() does
export function toolFrame(parent: Scope, agent: string): Scope {
    recordHandoff(parent, agent, "tool");
    return frame(childScope(parent, agent));
}

// A handoff inside one run() call switches the frame's agent in place
export function handOff(current: Scope, to: string): void {
    recordHandoff(current, to, "handoff");
    Object.assign(current, childScope(current, to));
}
