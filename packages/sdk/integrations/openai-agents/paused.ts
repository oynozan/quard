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

// Ends a Quard run, with the error that stopped it if any
export type Finish = (failure?: { error: unknown }) => void;

// The parts of an Agents SDK stream that noting it needs
type Stream = { state: object; completed: Promise<unknown>; error: unknown };

const byState = new WeakMap<object, Paused>();
// A state rebuilt from a string is a new object; its calls lead to the run
const byRun = new WeakMap<RunState, Paused>();
const resumed = new WeakSet<Paused>();

function note(state: object, paused: Paused): void {
    byState.set(state, paused);
    byRun.set(paused.run, paused);
}

// Puts back what a note replaced, unless a later note replaced it too
function putBack<K extends object>(map: WeakMap<K, Paused>, key: K, paused: Paused, prior: Paused | undefined): void {
    if (map.get(key) !== paused) {
        return;
    }
    if (prior === undefined) {
        map.delete(key);
    } else {
        map.set(key, prior);
    }
}

function stopped(result: unknown): boolean {
    const { interruptions, state } = result as { interruptions?: unknown[]; state?: object };
    return interruptions !== undefined && interruptions.length > 0 && state !== undefined;
}

// Notes a run that stopped with interruptions, so its state can resume it
export function notePause(result: unknown, paused: Paused): boolean {
    if (!stopped(result)) {
        return false;
    }
    note((result as { state: object }).state, paused);
    return true;
}

// A stream's state is noted as soon as the stream exists, so a resume
// that comes before the stream ends still goes back into the run. The
// first resume takes over the run's end. Else, as the stream ends, a run
// that did not stop gives back what its note replaced and finishes.
export function noteStream(result: Stream, paused: Paused, finish: Finish = () => undefined): void {
    const { state } = result;
    const prior = { state: byState.get(state), run: byRun.get(paused.run) };
    note(state, paused);
    const end = (failure?: { error: unknown }) => {
        if (resumed.has(paused)) {
            return;
        }
        putBack(byState, state, paused, prior.state);
        putBack(byRun, paused.run, paused, prior.run);
        finish(failure);
    };
    beforeStreamEnd(result, () => {
        if (!stopped(result)) {
            end();
        }
    });
    result.completed.then(undefined, (error: unknown) => end({ error }));
}

// Notes a pause once the run is over; for a stream, as soon as it starts
export function notePauseLater(result: unknown, paused: Paused): void {
    if (result instanceof StreamedRunResult) {
        noteStream(result, paused);
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
    if (paused === undefined || resumed.has(paused)) {
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
