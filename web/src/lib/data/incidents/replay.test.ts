// @vitest-environment node
import { describe, expect, it } from "vitest";
import { stepOf } from "../../../../test/data-guards-incidents/steps";
import { REVIEWER_MODEL } from "../agents/prices";
import { NOW } from "../rng";
import { fisherOneSided } from "./fisher";
import { buildReplay, reviewerNote } from "./replay";
import { INCIDENT_SPECS } from "./specs";
import type { ModelUsage, Step } from "../runs/types";

const OPENED = NOW - 60 * 60_000;

// The turning-point model call. 10,000 input and 1,000 output tokens on gpt-6.1:
// the warm-up call costs 0.028 USD and a cached rerun 0.0118 USD.
const USAGE: ModelUsage = {
    model: "gpt-6.1",
    inputTokens: 10_000,
    cachedTokens: 0,
    outputTokens: 1_000,
    costUsd: 0.028,
    toolCalls: ["send_email"],
};

function turning(model: ModelUsage | null = USAGE): Step {
    return stepOf({ kind: "model_call", agent: "support", name: model?.model ?? "unknown", model });
}

describe("reviewerNote", () => {
    it("is written 25 seconds after the incident opens, with the reviewer model", () => {
        const note = reviewerNote("inc_116", OPENED, ["First.", "Second."]);
        expect(note.model).toBe(REVIEWER_MODEL);
        expect(note.writtenAt).toBe(OPENED + 25_000);
        expect(note.paragraphs).toEqual(["First.", "Second."]);
    });

    it("costs the same every time for the same incident, rounded to 4 decimals", () => {
        const cost = reviewerNote("inc_116", OPENED, []).costUsd;
        expect(reviewerNote("inc_116", 0, []).costUsd).toBe(cost);
        expect(Math.round(cost * 10_000) / 10_000).toBe(cost);
        // 18,000 to 26,000 input and 900 to 1,400 output tokens on gpt-6.1-sol.
        expect(cost).toBeGreaterThanOrEqual(0.108);
        expect(cost).toBeLessThanOrEqual(0.158);
    });
});

describe("buildReplay", () => {
    const spec = INCIDENT_SPECS.inc_116;

    it("counts each round of 5 and the running totals, with the p-value so far", () => {
        const replay = buildReplay(spec, turning(), OPENED, 0);
        expect(
            replay.rounds.map(({ round, withContent, withoutContent, totalWith, totalWithout }) => ({
                round,
                withContent,
                withoutContent,
                totalWith,
                totalWithout,
            })),
        ).toEqual([
            {
                round: 1,
                withContent: { runs: 5, harmful: 4 },
                withoutContent: { runs: 5, harmful: 0 },
                totalWith: { runs: 5, harmful: 4 },
                totalWithout: { runs: 5, harmful: 0 },
            },
            {
                round: 2,
                withContent: { runs: 5, harmful: 4 },
                withoutContent: { runs: 5, harmful: 1 },
                totalWith: { runs: 10, harmful: 8 },
                totalWithout: { runs: 10, harmful: 1 },
            },
        ]);
        expect(replay.rounds[0].pValue).toBe(0.0238);
        expect(replay.rounds[1].pValue).toBe(Math.round(fisherOneSided(8, 10, 1, 10) * 10_000) / 10_000);
        expect(replay.status).toBe("confirmed");
        expect(replay.inProgress).toBe(false);
    });

    it("prices reruns from the recorded model, with the cache warm-up in round 1", () => {
        const replay = buildReplay(spec, turning(), OPENED, 0.1);
        expect(replay.model).toBe("gpt-6.1");
        expect(replay.rounds.map((round) => round.costUsd)).toEqual([0.174, 0.118]);
        expect(replay.costUsd).toBe(0.392);
        expect(replay.capReached).toBe(false);
    });

    it("times rounds 52 seconds apart, starting 40 seconds after the incident opens", () => {
        const replay = buildReplay(spec, turning(), OPENED, 0);
        expect(replay.startedAt).toBe(OPENED + 40_000);
        expect(replay.rounds.map((round) => round.finishedAt)).toEqual([OPENED + 92_000, OPENED + 144_000]);
    });

    it("uses flat gpt-6.1 prices when the turning point has no recorded usage", () => {
        const replay = buildReplay(spec, turning(null), OPENED, 0);
        expect(replay.model).toBe("gpt-6.1");
        expect(replay.rounds.map((round) => round.costUsd)).toEqual([0.07, 0.05]);
    });

    it("adds the reruns sent so far while a round is still running", () => {
        const replay = buildReplay(INCIDENT_SPECS.inc_118, turning(), OPENED, 0);
        expect(replay.inProgress).toBe(true);
        expect(replay.status).toBe("running");
        expect(replay.costUsd).toBe(0.2448);
    });

    it("says when the cost cap is reached", () => {
        const replay = buildReplay(spec, turning(), OPENED, 5);
        expect(replay.capUsd).toBe(5);
        expect(replay.capReached).toBe(true);
    });

    it("carries the spec's harmful call, removed content and limits", () => {
        const plain = buildReplay(spec, turning(), OPENED, 0);
        expect(plain.harmfulCall).toBe("send_email to a…@claims-desk.io");
        expect(plain.removedContent).toBe("The hidden text in the forwarded claim email");
        expect(plain.limited).toBe(false);
        expect(plain.limitedReason).toBeNull();
        expect([plain.threshold, plain.maxPerSide]).toEqual([0.0182, 20]);

        const limited = buildReplay(INCIDENT_SPECS.inc_109, turning(), OPENED, 0);
        expect(limited.limited).toBe(true);
        expect(limited.limitedReason).toBe(INCIDENT_SPECS.inc_109.limitedReason);
    });
});
