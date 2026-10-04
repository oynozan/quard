import { MAX_RUN_COUNTS, newEventId, type RunCountMessage } from "@quard/shared";
import type { RunState } from "../../context/run.ts";
import { addRunUsed, fitsControl, noteRunTotals, runUsed } from "../../guards/limit/run-counts.ts";
import type { Control } from "../../transport/link/control.ts";
import type { Reply } from "../../transport/link/requests.ts";
import { runCounted } from "../../transport/link/run-queue.ts";

// One addition to a counter of a shared run, with the cap control enforces
export type RunAdd = { counter: string; add: number; max: number | undefined };

function runCount(run: RunState, adds: readonly RunAdd[]): RunCountMessage {
    const counts = adds.map(({ counter, add, max }) => (max === undefined ? { counter, add } : { counter, add, max }));
    return { type: "run_count", id: newEventId(), runId: run.runId, counts };
}

// Counts here when control can't, adding nothing when an enforced cap is passed
function addHere(control: Control | undefined, run: RunState, adds: readonly RunAdd[]): number[] {
    const totals = adds.map((item) => runUsed(run, item.counter) + item.add);
    const refused = adds.some((item, index) => (totals[index] as number) > (item.max ?? Infinity));
    if (!refused) {
        for (const { counter, add } of adds) {
            addRunUsed(run, counter, add);
        }
        control?.runs.keep(run, adds);
    }
    return totals;
}

// Asks control to add all of the counts or none, and counts here when
// no answer comes in time
async function addThere(control: Control, run: RunState, adds: readonly RunAdd[]): Promise<number[]> {
    let kept = false;
    const reply = await control.requests.request(runCount(run, adds), {
        ms: control.replyMs,
        late: (late) => {
            const counted = runCounted(late, adds.length);
            if (counted === undefined) {
                return;
            }
            noteRunTotals(run, adds, counted.used);
            // Control counted them after all, so the local counts are not sent again
            if (kept && counted.ok) {
                control.runs.drop(run, adds);
            }
        },
    });
    const counted = runCounted(reply, adds.length);
    if (counted !== undefined) {
        noteRunTotals(run, adds, counted.used);
        // A refused call was added to none of the counters
        return adds.map((item, index) => (counted.used[index] as number) + (counted.ok ? 0 : item.add));
    }
    const totals = addHere(control, run, adds);
    kept = adds.every((item, index) => (totals[index] as number) <= (item.max ?? Infinity));
    return totals;
}

// Adds to the counters of a shared run, through control while it is
// there, in one message so control adds all of them or none. A call
// with more counts than one message takes counts here. Returns each
// counter's new total.
export async function addToRun(
    control: Control | undefined,
    run: RunState,
    adds: readonly RunAdd[],
): Promise<number[]> {
    const fits = adds.length <= MAX_RUN_COUNTS && adds.every((item) => fitsControl(item.counter));
    const linked = fits ? control : undefined;
    return linked?.link.ready() === true ? addThere(linked, run, adds) : addHere(linked, run, adds);
}

// The run's cost as control has it, or as this process knows it when
// control can't answer in time. Adding nothing reads the total.
export async function readCost(control: Control | undefined, run: RunState): Promise<number> {
    if (control?.link.ready() === true) {
        const read: RunAdd[] = [{ counter: "cost", add: 0, max: undefined }];
        const note = (reply: Reply | undefined) => {
            const counted = runCounted(reply, 1);
            if (counted !== undefined) {
                noteRunTotals(run, read, counted.used);
            }
        };
        note(await control.requests.request(runCount(run, read), { ms: control.replyMs, late: note }));
    }
    return run.costUsd;
}
