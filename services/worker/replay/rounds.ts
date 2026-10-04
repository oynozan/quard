import type { StoredRound } from "@quard/db";
import { messageOf } from "../jobs/deps.ts";
import { outcomeOf, pValueOf, ROUND_SIZE, type Count, type Outcome, type Totals } from "./outcome.ts";

export const CAP_USD = 5;

// "with" reruns keep the suspect content; "without" reruns leave it out
export type Side = "with" | "without";

// One rerun of the turning-point model call: whether the model asked for the
// same damaging call again, and what the rerun cost
export type Rerun = (side: Side) => Promise<{ harmful: boolean; costUsd: number }>;

export type Round = StoredRound;

export type Progress = {
    rounds: Round[];
    // Every model call the finder made for the incident, earlier ones included
    spentUsd: number;
};

export type Replay = Progress & {
    // Null when a rerun failed
    outcome: Outcome | "cap reached" | null;
    error: string | null;
};

export type ReplayOptions = {
    // What the finder already spent on the incident, such as earlier replay rounds
    spentUsd?: number;
    capUsd?: number;
    // What the first round will likely cost, so it never starts past the cap
    firstRoundUsd?: number;
    // Rounds played before, to continue after the cap was raised
    rounds?: Round[];
    // Called after each round, to save progress
    onRound?: (progress: Progress) => Promise<void>;
};

type Played = { side: Side; harmful: boolean; costUsd: number };

type Plays = { results: Played[]; error: string | null };

type RoundPlays = Plays & { capped: boolean };

function costOf(results: Played[]): number {
    return results.reduce((sum, result) => sum + result.costUsd, 0);
}

function add(a: Count, b: Count): Count {
    return { runs: a.runs + b.runs, harmful: a.harmful + b.harmful };
}

const NONE: Totals = { with: { runs: 0, harmful: 0 }, without: { runs: 0, harmful: 0 } };

function totalsOf(rounds: Totals[]): Totals {
    return rounds.reduce(
        (sum, round) => ({ with: add(sum.with, round.with), without: add(sum.without, round.without) }),
        NONE,
    );
}

// Waits for every rerun, so the cost of those that finished counts even when one failed
async function playAll(rerun: Rerun, sides: Side[]): Promise<Plays> {
    const settled = await Promise.allSettled(sides.map((side) => rerun(side).then((result) => ({ side, ...result }))));
    const failed = settled.find((item) => item.status === "rejected");
    return {
        results: settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : [])),
        error: failed === undefined ? null : messageOf(failed.reason),
    };
}

// The first round warms the prompt cache with one call per side, then sends
// the rest at once, unless the warm-up's cost shows the round would pass
// what is left under the cap
async function playRound(rerun: Rerun, first: boolean, leftUsd: number): Promise<RoundPlays> {
    const warm = first ? await playAll(rerun, ["with", "without"]) : { results: [], error: null };
    const capped = ROUND_SIZE * costOf(warm.results) > leftUsd;
    if (warm.error !== null || capped) {
        return { ...warm, capped };
    }
    const sides = Array.from({ length: ROUND_SIZE - warm.results.length / 2 }, () => ["with", "without"] as const);
    const rest = await playAll(rerun, sides.flat());
    return { results: [...warm.results, ...rest.results], error: rest.error, capped };
}

function roundOf(results: Played[], before: Totals, costUsd: number): Round {
    const countOf = (side: Side): Count => {
        const own = results.filter((result) => result.side === side);
        return { runs: own.length, harmful: own.filter((result) => result.harmful).length };
    };
    const round = { with: countOf("with"), without: countOf("without") };
    return { ...round, pValue: pValueOf(totalsOf([before, round])), costUsd, finishedAt: new Date().toISOString() };
}

// Reruns the turning point in rounds until the result is clear, or the next
// round could go past the cap. Then the counts so far are reported. A rerun
// that fails ends the replay with its error.
export async function runReplay(rerun: Rerun, options: ReplayOptions = {}): Promise<Replay> {
    const capUsd = options.capUsd ?? CAP_USD;
    let rounds = options.rounds ?? [];
    let spentUsd = options.spentUsd ?? 0;
    for (;;) {
        const totals = totalsOf(rounds);
        const outcome = rounds.length === 0 ? undefined : outcomeOf(totals);
        if (outcome !== undefined) {
            return { rounds, spentUsd, outcome, error: null };
        }
        // The next round should cost about what the last one did
        const nextUsd = rounds.at(-1)?.costUsd ?? options.firstRoundUsd ?? 0;
        if (spentUsd + nextUsd > capUsd) {
            return { rounds, spentUsd, outcome: "cap reached", error: null };
        }
        const played = await playRound(rerun, rounds.length === 0, capUsd - spentUsd);
        const costUsd = costOf(played.results);
        spentUsd += costUsd;
        if (played.error !== null) {
            return { rounds, spentUsd, outcome: null, error: played.error };
        }
        if (played.capped) {
            return { rounds, spentUsd, outcome: "cap reached", error: null };
        }
        rounds = [...rounds, roundOf(played.results, totals, costUsd)];
        await options.onRound?.({ rounds, spentUsd });
    }
}
