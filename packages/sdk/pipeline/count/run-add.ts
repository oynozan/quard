import { newEventId, type RunCountMessage } from "@quard/shared";
import type { RunState } from "../../context/run.ts";
import { addRunUsed, fitsControl, noteRunUsed, runUsed } from "../../guards/limit/run-counts.ts";
import type { Control } from "../../transport/link/control.ts";
import type { Reply } from "../../transport/link/requests.ts";

// One addition to a counter of a shared run, with the cap control enforces
export type RunAdd = { counter: string; add: number; max: number | undefined };

function runCount(run: RunState, counter: string, add: number, max?: number): RunCountMessage {
    const message: RunCountMessage = { type: "run_count", id: newEventId(), runId: run.runId, counter, add };
    return max === undefined ? message : { ...message, max };
}

// Counts here when control can't, adding nothing when an enforced cap is passed
function addHere(control: Control | undefined, run: RunState, adds: readonly RunAdd[]): number[] {
    const totals = adds.map((item) => runUsed(run, item.counter) + item.add);
    const refused = adds.some((item, index) => (totals[index] as number) > (item.max ?? Infinity));
    if (!refused) {
        for (const { counter, add } of adds) {
            addRunUsed(run, counter, add);
            control?.runs.keep({ run, counter, add });
        }
    }
    return totals;
}

// Asks control to count, and counts here when no answer comes in time
async function addThere(control: Control, run: RunState, item: RunAdd): Promise<number> {
    const { counter, add, max } = item;
    let kept = false;
    const reply = await control.requests.request(runCount(run, counter, add, max), {
        ms: control.replyMs,
        late: (late) => {
            if (late?.type !== "counted") {
                return;
            }
            noteRunUsed(run, counter, late.used);
            // Control counted it after all, so the local count is not sent again
            if (kept && late.ok) {
                control.runs.drop({ run, counter, add });
            }
        },
    });
    if (reply?.type === "counted") {
        noteRunUsed(run, counter, reply.used);
        // A refused count was not added
        return reply.ok ? reply.used : reply.used + add;
    }
    const [total] = addHere(control, run, [item]) as [number];
    kept = total <= (max ?? Infinity);
    return total;
}

// Adds to the counters of a shared run, through control while it is
// there. Returns each counter's new total.
export async function addToRun(
    control: Control | undefined,
    run: RunState,
    adds: readonly RunAdd[],
): Promise<number[]> {
    const linked = adds.every((item) => fitsControl(item.counter)) ? control : undefined;
    return linked?.link.ready() === true
        ? Promise.all(adds.map((item) => addThere(linked, run, item)))
        : addHere(linked, run, adds);
}

// The run's cost as control has it, or as this process knows it when
// control can't answer in time. Adding nothing reads the total.
export async function readCost(control: Control | undefined, run: RunState): Promise<number> {
    if (control?.link.ready() === true) {
        const note = (reply: Reply | undefined) => {
            if (reply?.type === "counted") {
                noteRunUsed(run, "cost", reply.used);
            }
        };
        note(await control.requests.request(runCount(run, "cost", 0), { ms: control.replyMs, late: note }));
    }
    return run.costUsd;
}
