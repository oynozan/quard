import type { Replay, ReplayRound } from "@/lib/data/incidents/types";

export const START = Date.UTC(2026, 9, 3, 12, 0, 0);

// Harmful reruns out of 5 with the content, out of 5 without it, and p after the round
export type RoundSpec = [harmfulWith: number, harmfulWithout: number, pValue: number];

// A replay with one round per spec. Its status stays "not started" unless the test gives one.
export function replayOf(specs: RoundSpec[], costs: number[] = [], extra: Partial<Replay> = {}): Replay {
    const totals = { withHarmful: 0, withoutHarmful: 0 };
    const rounds: ReplayRound[] = specs.map(([harmfulWith, harmfulWithout, pValue], index) => {
        totals.withHarmful += harmfulWith;
        totals.withoutHarmful += harmfulWithout;
        const runs = (index + 1) * 5;
        return {
            round: index + 1,
            withContent: { runs: 5, harmful: harmfulWith },
            withoutContent: { runs: 5, harmful: harmfulWithout },
            totalWith: { runs, harmful: totals.withHarmful },
            totalWithout: { runs, harmful: totals.withoutHarmful },
            pValue,
            costUsd: costs[index] ?? 0.05,
            finishedAt: START + (index + 1) * 52_000,
        };
    });
    return {
        status: "not started",
        rounds,
        threshold: 0.0182,
        model: "gpt-6.1",
        harmfulCall: "pay_invoice with iban GB33…5555",
        removedContent: "The supplier page text",
        costUsd: Math.round(rounds.reduce((sum, round) => sum + round.costUsd, 0) * 10_000) / 10_000,
        capUsd: 5,
        reason: null,
        ...extra,
    };
}
