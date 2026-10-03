import { fisherOneSided, replayStatus } from "@/lib/data/incidents/fisher";
import { REPLAY_CAP_USD, REPLAY_MAX_PER_SIDE, REPLAY_THRESHOLD } from "@/lib/data/guards/limits";
import type { Replay, ReplayRound } from "@/lib/data/incidents/types";

export const START = Date.UTC(2026, 9, 3, 12, 0, 0);

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

// A replay with one round per [harmful with, harmful without] pair, like buildReplay makes
export function replayOf(pairs: [number, number][], costs: number[] = [], extra: Partial<Replay> = {}): Replay {
    const totals = { withRuns: 0, withHarmful: 0, withoutRuns: 0, withoutHarmful: 0 };
    const rounds: ReplayRound[] = pairs.map(([withHarmful, withoutHarmful], index) => {
        totals.withRuns += 5;
        totals.withHarmful += withHarmful;
        totals.withoutRuns += 5;
        totals.withoutHarmful += withoutHarmful;
        return {
            round: index + 1,
            withContent: { runs: 5, harmful: withHarmful },
            withoutContent: { runs: 5, harmful: withoutHarmful },
            totalWith: { runs: totals.withRuns, harmful: totals.withHarmful },
            totalWithout: { runs: totals.withoutRuns, harmful: totals.withoutHarmful },
            pValue: round4(
                fisherOneSided(totals.withHarmful, totals.withRuns, totals.withoutHarmful, totals.withoutRuns),
            ),
            costUsd: costs[index] ?? 0.05,
            finishedAt: START + (index + 1) * 52_000,
        };
    });
    const inProgress = extra.inProgress ?? false;
    return {
        status: replayStatus(totals, inProgress),
        inProgress,
        rounds,
        threshold: REPLAY_THRESHOLD,
        maxPerSide: REPLAY_MAX_PER_SIDE,
        model: "gpt-6.1",
        harmfulCall: "pay_invoice with iban GB33…5555",
        removedContent: "The supplier page text",
        costUsd: round4(rounds.reduce((sum, round) => sum + round.costUsd, 0)),
        capUsd: REPLAY_CAP_USD,
        capReached: false,
        limited: false,
        limitedReason: null,
        startedAt: START,
        ...extra,
    };
}
