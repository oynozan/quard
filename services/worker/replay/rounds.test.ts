import { describe, expect, it, vi } from "vitest";
import { runReplay, type Rerun, type Side } from "./rounds.ts";

const COST = 0.01;

// A rerun that answers from a script per side: true is a harmful rerun
function scripted(script: Record<Side, boolean[]>) {
    const left = { with: [...script.with], without: [...script.without] };
    return vi.fn<Rerun>(async (side) => ({ harmful: left[side].shift() ?? false, costUsd: COST }));
}

// Harmful reruns per round of 5, as a script for one side
function perRound(...counts: number[]): boolean[] {
    return counts.flatMap((count) => Array.from({ length: 5 }, (_, i) => i < count));
}

describe("runReplay", () => {
    it("confirms in one round when every rerun with the content is harmful and none without", async () => {
        const rerun = scripted({ with: perRound(5), without: perRound(0) });

        const replay = await runReplay(rerun);

        expect(replay).toEqual({
            outcome: "confirmed",
            error: null,
            spentUsd: expect.closeTo(10 * COST, 9),
            rounds: [
                {
                    with: { runs: 5, harmful: 5 },
                    without: { runs: 5, harmful: 0 },
                    pValue: expect.closeTo(1 / 252, 9),
                    costUsd: expect.closeTo(10 * COST, 9),
                    finishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                },
            ],
        });
        expect(rerun).toHaveBeenCalledTimes(10);
    });

    it("warms the prompt cache with one call per side before sending the rest", async () => {
        let finished = 0;
        const seenAtStart: number[] = [];
        const rerun: Rerun = async () => {
            seenAtStart.push(finished);
            await new Promise((resolve) => setTimeout(resolve, 1));
            finished += 1;
            return { harmful: false, costUsd: COST };
        };

        await runReplay(rerun);

        // The two warm-up calls start together; every other call of the round waits for both
        expect(seenAtStart.slice(0, 2)).toEqual([0, 0]);
        expect(seenAtStart.slice(2, 10)).toEqual(Array.from({ length: 8 }, () => 2));
    });

    it("stops after two rounds when no rerun with the content was harmful", async () => {
        const replay = await runReplay(scripted({ with: [], without: [] }));

        expect(replay.outcome).toBe("could not reproduce");
        expect(replay.rounds).toHaveLength(2);
    });

    it("stops as not confirmed when the test can no longer pass", async () => {
        const rerun = scripted({ with: perRound(1, 1, 0), without: perRound(1, 2, 1) });

        const replay = await runReplay(rerun);

        expect(replay.outcome).toBe("not confirmed");
        expect(replay.rounds.map((round) => [round.with.harmful, round.without.harmful])).toEqual([
            [1, 1],
            [1, 2],
            [0, 1],
        ]);
        expect(replay.rounds.at(-1)?.pValue).toBeCloseTo(0.9157, 4);
    });

    it("stops before a round that would pass the cap, and continues once the cap is raised", async () => {
        const rerun = scripted({ with: perRound(4, 4), without: perRound(0, 1) });

        const paused = await runReplay(rerun, { spentUsd: 4.85, firstRoundUsd: 10 * COST });

        expect(paused).toMatchObject({ outcome: "cap reached", spentUsd: expect.closeTo(4.95, 9) });
        expect(paused.rounds).toHaveLength(1);

        const done = await runReplay(rerun, { ...paused, capUsd: 6 });

        expect(done).toMatchObject({ outcome: "confirmed", spentUsd: expect.closeTo(5.05, 9) });
        expect(done.rounds.map((round) => round.with.harmful)).toEqual([4, 4]);
        expect(rerun).toHaveBeenCalledTimes(20);
    });

    it("never starts a first round that would pass the cap", async () => {
        const rerun = scripted({ with: [], without: [] });

        const replay = await runReplay(rerun, { spentUsd: 4.95, firstRoundUsd: 10 * COST });

        expect(replay).toEqual({ rounds: [], spentUsd: 4.95, outcome: "cap reached", error: null });
        expect(rerun).not.toHaveBeenCalled();
    });

    it("stops after the warm-up when its cost shows the round would pass the cap", async () => {
        const rerun = vi.fn<Rerun>(async () => ({ harmful: true, costUsd: 0.8 }));

        // No estimate for the first round: the turning point's cost was not recorded
        const replay = await runReplay(rerun, { spentUsd: 4.5 });

        expect(replay).toEqual({ rounds: [], spentUsd: expect.closeTo(6.1, 9), outcome: "cap reached", error: null });
        expect(rerun).toHaveBeenCalledTimes(2);
    });

    it("reports progress after each round", async () => {
        const onRound = vi.fn(async () => {});

        const replay = await runReplay(scripted({ with: [], without: [] }), { onRound });

        expect(onRound.mock.calls).toEqual([
            [{ rounds: replay.rounds.slice(0, 1), spentUsd: expect.closeTo(10 * COST, 9) }],
            [{ rounds: replay.rounds, spentUsd: expect.closeTo(20 * COST, 9) }],
        ]);
    });

    it("ends with the error of a failed rerun and keeps the cost of the calls that finished", async () => {
        let calls = 0;
        const rerun: Rerun = async () => {
            calls += 1;
            if (calls === 4) {
                throw new Error("The model call failed with status 500");
            }
            return { harmful: false, costUsd: COST };
        };

        const replay = await runReplay(rerun, { spentUsd: 1 });

        expect(replay).toEqual({
            rounds: [],
            spentUsd: expect.closeTo(1 + 9 * COST, 9),
            outcome: null,
            error: "The model call failed with status 500",
        });
    });

    it("stops after a failed warm-up call without sending the rest", async () => {
        const rerun = vi.fn<Rerun>(async (side) => {
            if (side === "without") {
                throw "offline";
            }
            return { harmful: true, costUsd: COST };
        });

        const replay = await runReplay(rerun);

        expect(replay).toMatchObject({ rounds: [], spentUsd: COST, outcome: null, error: "offline" });
        expect(rerun).toHaveBeenCalledTimes(2);
    });
});
