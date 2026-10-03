// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fisherOneSided } from "@/lib/data/incidents/fisher";
import { replayOf, START } from "../../../../test/incidents-search/replay";
import { canReplay, nextRound } from "./simulate";

describe("canReplay", () => {
    it("allows a round when nothing stops it", () => {
        expect(canReplay(replayOf([[4, 0]]))).toEqual({ ok: true, reason: null });
    });

    it("allows the first round of a replay with no rounds", () => {
        expect(canReplay(replayOf([]))).toEqual({ ok: true, reason: null });
    });

    it("blocks while a round is running, before any other reason", () => {
        const replay = replayOf([[4, 0]], [], { inProgress: true, capReached: true });
        expect(canReplay(replay)).toEqual({ ok: false, reason: "A round is running now" });
    });

    it("blocks once the cost cap is reached", () => {
        const replay = replayOf([[4, 0]], [], { capReached: true, limited: true });
        expect(canReplay(replay)).toEqual({ ok: false, reason: "The $5 cost cap is reached" });
    });

    it("blocks when only URL evidence exists", () => {
        expect(canReplay(replayOf([[4, 0]], [], { limited: true }))).toEqual({
            ok: false,
            reason: "URL-only evidence can't be rebuilt",
        });
    });

    it("blocks once every rerun per side is used", () => {
        const replay = replayOf([
            [1, 1],
            [1, 1],
            [1, 1],
            [1, 1],
        ]);
        expect(canReplay(replay)).toEqual({ ok: false, reason: "All 20 reruns per side are used" });
    });
});

describe("nextRound", () => {
    it("returns the same replay when there is no first round to repeat", () => {
        const replay = replayOf([]);
        expect(nextRound(replay)).toBe(replay);
    });

    it("repeats the first round and costs a share of it after one round", () => {
        const next = nextRound(replayOf([[4, 0]], [0.05]));
        const added = next.rounds[1];
        expect(next.rounds).toHaveLength(2);
        expect(added.round).toBe(2);
        expect(added.withContent).toEqual({ runs: 5, harmful: 4 });
        expect(added.withoutContent).toEqual({ runs: 5, harmful: 0 });
        expect(added.totalWith).toEqual({ runs: 10, harmful: 8 });
        expect(added.totalWithout).toEqual({ runs: 10, harmful: 0 });
        expect(added.pValue).toBe(Math.round(fisherOneSided(8, 10, 0, 10) * 10_000) / 10_000);
        expect(added.costUsd).toBe(0.03);
        expect(added.finishedAt).toBe(START + 2 * 52_000);
        expect(next.costUsd).toBe(0.08);
        expect(next.status).toBe("confirmed");
        expect(next.capReached).toBe(false);
    });

    it("costs what round 2 cost once there are two rounds", () => {
        const next = nextRound(
            replayOf(
                [
                    [1, 1],
                    [1, 1],
                ],
                [0.05, 0.02],
            ),
        );
        expect(next.rounds[2].costUsd).toBe(0.02);
        expect(next.costUsd).toBe(0.09);
        expect(next.status).toBe("not confirmed");
    });

    it("marks the cap reached when the new round spends past it", () => {
        const next = nextRound(replayOf([[4, 0]], [0.05], { costUsd: 4.99 }));
        expect(next.costUsd).toBe(5.02);
        expect(next.capReached).toBe(true);
    });
});
