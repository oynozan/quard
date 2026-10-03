import { BuildState } from "@/lib/data/runs/build/state";
import { createRng, HOUR, NOW } from "@/lib/data/rng";
import type { Rng } from "@/lib/data/rng";

export const RUN_ID = "b".repeat(32);

// An hour before "now": outside the backend outage and well before the cut.
export const START = NOW - HOUR;

// A fresh build state with a fixed seed, so every test sees the same numbers.
export function newState(startedAt = START, rng: Rng = createRng(7)): BuildState {
    return new BuildState(RUN_ID, rng, startedAt);
}

// An rng that returns the given numbers in turn, then repeats the last one.
export function scriptedRng(values: number[]): Rng {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
}
