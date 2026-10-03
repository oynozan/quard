import { newRunId } from "@quard/shared";
import { ContentIndex } from "../labels/content-index.ts";

export type RunState = {
    runId: string;
    index: ContentIndex;
    // Per-run counters for limit guards
    counters: Map<string, number>;
};

export function newRun(runId: string = newRunId()): RunState {
    return { runId, index: new ContentIndex(), counters: new Map() };
}
