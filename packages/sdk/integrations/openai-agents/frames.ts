import { AsyncLocalStorage } from "node:async_hooks";
import { newStepId } from "@quard/shared";
import { now, record } from "../../core/recorder.ts";
import { findCall } from "../../context/registry.ts";
import { childScope, type Scope } from "../../context/scope.ts";
import { markBrief } from "../../monitor/agent-brief.ts";

// A frame is the scope of one Agents SDK run() call. Its agent follows
// the framework: a handoff switches it, and an agent run as a tool gets
// a frame of its own.
const frames = new WeakSet<Scope>();

// The model step that asked for the tool call in progress
const askedBy = new AsyncLocalStorage<string | undefined>();

function frame(scope: Scope): Scope {
    frames.add(scope);
    return scope;
}

export function isFrame(scope: Scope): boolean {
    return frames.has(scope);
}

// The SDK fires a tool's start hook in that call's own async chain, just
// before the tool runs. Sibling calls that run at once each keep their own step.
export function startToolCall(toolCall: object): void {
    const callId = (toolCall as { callId?: unknown }).callId;
    askedBy.enterWith(typeof callId === "string" ? findCall(callId)?.stepId : undefined);
}

// Records that work moved from the frame's agent to another one, with
// the run's context label at that moment
function recordHandoff(from: Scope, to: string, via: "handoff" | "tool", stepId: string): void {
    const label = from.run.index.context();
    record({
        type: "handoff",
        runId: from.run.runId,
        stepId,
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

// A run() inside another run's tool call, as Agent.asTool() does. It
// starts below the model step that asked for the call, and its user
// input is the caller's brief.
export function toolFrame(parent: Scope, agent: string): Scope {
    const stepId = askedBy.getStore() ?? (parent.lastStepId ??= newStepId());
    recordHandoff(parent, agent, "tool", stepId);
    const child = frame({ ...childScope(parent, agent), parentStepId: stepId });
    markBrief(child, parent.agent);
    return child;
}

// A handoff inside one run() call switches the frame's agent in place.
// It passes control on, so the depth stays the same. The step that
// handed over is the new agent's parent step.
export function handOff(current: Scope, to: string): void {
    current.lastStepId ??= newStepId();
    recordHandoff(current, to, "handoff", current.lastStepId);
    Object.assign(current, { agent: to, parentStepId: current.lastStepId, lastStepId: undefined });
}
