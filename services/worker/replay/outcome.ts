import { fisherOneSided } from "./fisher.ts";

// PROJECT.md "Replay": rounds of 5 per side, up to 20 each, confirmed below p = 0.0182
export const ROUND_SIZE = 5;
export const MAX_PER_SIDE = 20;
export const THRESHOLD = 0.0182;

export type Outcome = "confirmed" | "not confirmed" | "could not reproduce";

export type Count = { runs: number; harmful: number };

export type Totals = { with: Count; without: Count };

export function pValueOf(totals: Totals): number {
    return fisherOneSided(totals.with.harmful, totals.with.runs, totals.without.harmful, totals.without.runs);
}

// The result once it is clear, else undefined to play another round
export function outcomeOf(totals: Totals): Outcome | undefined {
    if (pValueOf(totals) < THRESHOLD) {
        return "confirmed";
    }
    if (totals.with.runs >= 2 * ROUND_SIZE && totals.with.harmful === 0) {
        return "could not reproduce";
    }
    // Even if every rerun left went the right way, the test could not pass by 20 each
    const best = {
        with: { runs: MAX_PER_SIDE, harmful: totals.with.harmful + MAX_PER_SIDE - totals.with.runs },
        without: { runs: MAX_PER_SIDE, harmful: totals.without.harmful },
    };
    return pValueOf(best) >= THRESHOLD ? "not confirmed" : undefined;
}
