import { RunState as SdkState } from "@openai/agents";
import { findCall } from "../../context/registry.ts";
import type { RunState } from "../../context/run.ts";
import type { Scope } from "../../context/scope.ts";

// A run that stopped for the SDK's own approval (needsApproval): the
// frame it stopped in, and the root scope that records its end
export type Paused = { root: Scope; frame: Scope };

const byState = new WeakMap<object, Paused>();
// A state rebuilt from a string is a new object; its calls lead to the run
const byRun = new WeakMap<RunState, Paused>();
const resumed = new WeakSet<Paused>();

// Notes a run that stopped with interruptions, so its state can resume it
export function notePause(result: unknown, paused: Paused): boolean {
    const { interruptions, state } = result as { interruptions?: unknown[]; state?: object };
    if (interruptions === undefined || interruptions.length === 0 || state === undefined) {
        return false;
    }
    byState.set(state, paused);
    byRun.set(paused.root.run, paused);
    return true;
}

function callRun(item: { rawItem: unknown }): RunState | undefined {
    const callId = (item.rawItem as { callId?: unknown }).callId;
    return typeof callId === "string" ? findCall(callId)?.scope.run : undefined;
}

// The paused run a run() input resumes, if this process noted it
export function pausedOf(input: unknown): Paused | undefined {
    if (!(input instanceof SdkState)) {
        return undefined;
    }
    const runs = input.getInterruptions().map(callRun);
    return byState.get(input) ?? runs.map((run) => (run === undefined ? undefined : byRun.get(run))).find(Boolean);
}

// The first resume goes back into the paused run, which then ends again
export function takePaused(paused: Paused | undefined): Paused | undefined {
    if (paused === undefined || resumed.has(paused)) {
        return undefined;
    }
    resumed.add(paused);
    return paused;
}

// Any other run that resumes the state brings the paused run's labels
export function carryLabels(paused: Paused | undefined, run: RunState): void {
    if (paused !== undefined && paused.root.run !== run) {
        run.index.absorb(paused.root.run.index);
    }
}
