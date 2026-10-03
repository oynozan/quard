import { costOf, REVIEWER_MODEL } from "../agents/prices";
import { REPLAY_CAP_USD, REPLAY_MAX_PER_SIDE, REPLAY_THRESHOLD } from "../guards/limits";
import { createRng, seedFrom } from "../rng";
import { fisherOneSided, replayStatus } from "./fisher";
import type { Step } from "../runs/types";
import type { IncidentSpec } from "./specs";
import type { Replay, ReplayRound, ReviewerNote } from "./types";

const ROUND_MS = 52_000;

function usd(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

// One rerun of the turning-point model call. After the warm-up most of the input is cached.
function rerunCost(turning: Step): { warm: number; rerun: number; model: string } {
    const usage = turning.model;
    if (!usage) return { warm: 0.01, rerun: 0.005, model: "gpt-6.1" };
    return {
        warm: costOf(usage.model, usage.inputTokens, 0, usage.outputTokens),
        rerun: costOf(usage.model, usage.inputTokens, Math.round(usage.inputTokens * 0.9), usage.outputTokens),
        model: usage.model,
    };
}

// The reviewer writes as soon as the verdict exists, with the team's own provider key.
export function reviewerNote(incidentId: string, openedAt: number, paragraphs: string[]): ReviewerNote {
    const rng = createRng(seedFrom(`review:${incidentId}`));
    const input = 18_000 + Math.floor(rng() * 8_000);
    const output = 900 + Math.floor(rng() * 500);
    return {
        model: REVIEWER_MODEL,
        costUsd: usd(costOf(REVIEWER_MODEL, input, 0, output)),
        writtenAt: openedAt + 25_000,
        paragraphs,
    };
}

// Rounds of 5 with and 5 without the suspect content, as the spec recorded them.
export function buildReplay(spec: IncidentSpec, turning: Step, openedAt: number, reviewerCost: number): Replay {
    const price = rerunCost(turning);
    const startedAt = openedAt + 40_000;
    const totals = { withRuns: 0, withHarmful: 0, withoutRuns: 0, withoutHarmful: 0 };
    const rounds: ReplayRound[] = spec.rounds.map(([harmfulWith, harmfulWithout], index) => {
        totals.withRuns += 5;
        totals.withHarmful += harmfulWith;
        totals.withoutRuns += 5;
        totals.withoutHarmful += harmfulWithout;
        // The first round also warms the prompt cache with one call per side.
        const costUsd = usd(10 * price.rerun + (index === 0 ? 2 * price.warm : 0));
        return {
            round: index + 1,
            withContent: { runs: 5, harmful: harmfulWith },
            withoutContent: { runs: 5, harmful: harmfulWithout },
            totalWith: { runs: totals.withRuns, harmful: totals.withHarmful },
            totalWithout: { runs: totals.withoutRuns, harmful: totals.withoutHarmful },
            pValue:
                Math.round(
                    fisherOneSided(totals.withHarmful, totals.withRuns, totals.withoutHarmful, totals.withoutRuns) *
                        10_000,
                ) / 10_000,
            costUsd,
            finishedAt: startedAt + (index + 1) * ROUND_MS,
        };
    });
    const inProgress = spec.inProgress ?? false;
    // Reruns of the round that is still running, sent so far.
    const running = inProgress ? 6 * price.rerun : 0;
    const costUsd = usd(rounds.reduce((sum, round) => sum + round.costUsd, 0) + running + reviewerCost);
    return {
        status: replayStatus(totals, inProgress),
        inProgress,
        rounds,
        threshold: REPLAY_THRESHOLD,
        maxPerSide: REPLAY_MAX_PER_SIDE,
        model: price.model,
        harmfulCall: spec.harmfulCall,
        removedContent: spec.removedContent,
        costUsd,
        capUsd: REPLAY_CAP_USD,
        capReached: costUsd >= REPLAY_CAP_USD,
        limited: Boolean(spec.limitedReason),
        limitedReason: spec.limitedReason ?? null,
        startedAt,
    };
}
