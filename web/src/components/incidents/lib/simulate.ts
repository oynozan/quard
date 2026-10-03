import { fisherOneSided, replayStatus } from "@/lib/data/incidents/fisher";
import type { Replay, ReplayRound } from "@/lib/data/incidents/types";

const ROUND_MS = 52_000;

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

// Whether another round of 5 and 5 may run.
export function canReplay(replay: Replay): { ok: boolean; reason: string | null } {
    const last = replay.rounds.at(-1);
    if (replay.inProgress) return { ok: false, reason: "A round is running now" };
    if (replay.capReached) return { ok: false, reason: "The $5 cost cap is reached" };
    if (replay.limited) return { ok: false, reason: "URL-only evidence can't be rebuilt" };
    if (last && last.totalWith.runs >= replay.maxPerSide) {
        return { ok: false, reason: `All ${replay.maxPerSide} reruns per side are used` };
    }
    return { ok: true, reason: null };
}

// A demo round that repeats the pattern of the first one, so the result stays stable.
export function nextRound(replay: Replay): Replay {
    const rounds = replay.rounds;
    const first = rounds[0];
    const last = rounds.at(-1);
    if (!first || !last) return replay;
    const harmfulWith = first.withContent.harmful;
    const harmfulWithout = first.withoutContent.harmful;
    const totalWith = { runs: last.totalWith.runs + 5, harmful: last.totalWith.harmful + harmfulWith };
    const totalWithout = { runs: last.totalWithout.runs + 5, harmful: last.totalWithout.harmful + harmfulWithout };
    // Later rounds hit the warm cache, so they cost what round 2 cost, or a share of round 1.
    const costUsd = rounds[1]?.costUsd ?? round4(first.costUsd * 0.6);
    const round: ReplayRound = {
        round: last.round + 1,
        withContent: { runs: 5, harmful: harmfulWith },
        withoutContent: { runs: 5, harmful: harmfulWithout },
        totalWith,
        totalWithout,
        pValue: round4(fisherOneSided(totalWith.harmful, totalWith.runs, totalWithout.harmful, totalWithout.runs)),
        costUsd,
        finishedAt: last.finishedAt + ROUND_MS,
    };
    const spent = round4(replay.costUsd + costUsd);
    const status = replayStatus(
        {
            withRuns: totalWith.runs,
            withHarmful: totalWith.harmful,
            withoutRuns: totalWithout.runs,
            withoutHarmful: totalWithout.harmful,
        },
        false,
    );
    return {
        ...replay,
        rounds: [...rounds, round],
        status,
        costUsd: spent,
        capReached: spent >= replay.capUsd,
    };
}
