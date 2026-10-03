import { newRunId } from "@quard/shared";
import { ContentIndex } from "../labels/content-index.ts";

// Handoffs between two agents: who sent the last one, and how many turns
export type PairTurns = { lastFrom: string; turns: number };

export type RunState = {
    runId: string;
    index: ContentIndex;
    // Per-run counters for limit guards
    counters: Map<string, number>;
    // Distinct helpers each agent delegated to
    helpers: Map<string, Set<string>>;
    // Keyed by the two agent names in sorted order
    turns: Map<string, PairTurns>;
    modelCalls: number;
    // Estimated from token usage; calls with no known price add nothing
    costUsd: number;
};

export function newRun(runId: string = newRunId()): RunState {
    return {
        runId,
        index: new ContentIndex(),
        counters: new Map(),
        helpers: new Map(),
        turns: new Map(),
        modelCalls: 0,
        costUsd: 0,
    };
}
