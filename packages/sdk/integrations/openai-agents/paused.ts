import { RunState as SdkState, StreamedRunResult } from "@openai/agents";
import { findCall } from "../../context/registry.ts";
import type { RunState } from "../../context/run.ts";
import type { Scope } from "../../context/scope.ts";
import { beforeStreamEnd } from "./stream-end.ts";

// The frame a run stopped in, and the root scope that records its end
export type Resume = { root: Scope; frame: Scope };

// A run that stopped for the SDK's own approval (needsApproval). Only a
// run this integration started can be gone back into.
export type Paused = { run: RunState; resume?: Resume };

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
    byRun.set(paused.run, paused);
    return true;
}

// Notes a pause once the run is over; for a stream, as it ends
export function notePauseLater(result: unknown, paused: Paused): void {
    if (result instanceof StreamedRunResult) {
        beforeStreamEnd(result, () => notePause(result, paused));
        return;
    }
    notePause(result, paused);
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
export function takePaused(paused: Paused | undefined): Resume | undefined {
    if (paused?.resume === undefined || resumed.has(paused)) {
        return undefined;
    }
    resumed.add(paused);
    return paused.resume;
}

// Any other run that resumes the state brings the paused run's labels
export function carryLabels(paused: Paused | undefined, run: RunState): void {
    if (paused !== undefined && paused.run !== run) {
        run.index.absorb(paused.run.index);
    }
}
