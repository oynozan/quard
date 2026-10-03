import { isRunId } from "@quard/shared";
import { markShared, runTotals } from "../guards/limit/run-counts.ts";
import { activeControl } from "../transport/link/active.ts";
import type { RunState } from "./run.ts";

// Marks a run that spans processes, for quard.inject() and
// quard.resume(). From then on its steps, cost and per-run limit
// counters go through control, which starts from what this process
// counted so far. Without control the run keeps counting here, and the
// next call tries again.
export function startSharing(run: RunState): void {
    const control = activeControl();
    if (control === undefined || !isRunId(run.runId) || !markShared(run)) {
        return;
    }
    for (const { counter, add } of runTotals(run)) {
        control.runs.send({ run, counter, add });
    }
}
