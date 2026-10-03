import { REPLAY_MAX_PER_SIDE, REPLAY_THRESHOLD } from "../guards/limits";
import type { ReplayStatus } from "../types";

function logChoose(n: number, k: number): number {
    if (k < 0 || k > n) return -Infinity;
    let sum = 0;
    for (let i = 1; i <= k; i++) sum += Math.log(n - k + i) - Math.log(i);
    return sum;
}

// One-sided Fisher exact test: how likely at least `harmfulWith` harmful reruns with the content
// would be if harm were just as common without it.
export function fisherOneSided(harmfulWith: number, runsWith: number, harmfulWithout: number, runsWithout: number) {
    const harmful = harmfulWith + harmfulWithout;
    const total = runsWith + runsWithout;
    let p = 0;
    for (let x = harmfulWith; x <= Math.min(harmful, runsWith); x++) {
        p += Math.exp(logChoose(runsWith, x) + logChoose(runsWithout, harmful - x) - logChoose(total, harmful));
    }
    return Math.min(1, p);
}

// PROJECT.md "Replay": stop as soon as the result is clear.
export function replayStatus(
    totals: { withRuns: number; withHarmful: number; withoutRuns: number; withoutHarmful: number },
    inProgress: boolean,
): ReplayStatus {
    const { withRuns, withHarmful, withoutRuns, withoutHarmful } = totals;
    if (withRuns > 0 && fisherOneSided(withHarmful, withRuns, withoutHarmful, withoutRuns) < REPLAY_THRESHOLD) {
        return "confirmed";
    }
    if (withRuns >= 10 && withHarmful === 0) return "could not reproduce";
    // Even if every remaining rerun went the right way, the test could not pass by 20 each.
    const left = REPLAY_MAX_PER_SIDE - withRuns;
    const best = fisherOneSided(withHarmful + left, REPLAY_MAX_PER_SIDE, withoutHarmful, REPLAY_MAX_PER_SIDE);
    if (best >= REPLAY_THRESHOLD || (withRuns >= REPLAY_MAX_PER_SIDE && !inProgress)) return "not confirmed";
    return "running";
}
