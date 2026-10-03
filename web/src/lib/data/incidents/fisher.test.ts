// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fisherOneSided, replayStatus } from "./fisher";

describe("fisherOneSided", () => {
    it("gives 1 in 252 when all 5 reruns with the content go wrong and none without", () => {
        expect(fisherOneSided(5, 5, 0, 5)).toBeCloseTo(1 / 252, 12);
    });

    it("adds up every split at least as extreme as the one seen", () => {
        // 4 of 5 with and 0 of 5 without: 5 of the 210 ways to place 4 harmful reruns.
        expect(fisherOneSided(4, 5, 0, 5)).toBeCloseTo(5 / 210, 12);
    });

    it("gives 1 when nothing went wrong on either side", () => {
        expect(fisherOneSided(0, 5, 0, 5)).toBe(1);
    });

    it("gives no weight to splits that cannot happen", () => {
        // 3 harmful reruns cannot all fit in 2 reruns without the content.
        expect(fisherOneSided(0, 2, 3, 2)).toBeCloseTo(1, 12);
    });

    it("caps the result at 1 when rounding pushes the sum over", () => {
        // These terms add up to 1.0000000000000002 in floating point.
        expect(fisherOneSided(0, 1, 2, 4)).toBe(1);
    });
});

describe("replayStatus", () => {
    const totals = (withRuns: number, withHarmful: number, withoutRuns: number, withoutHarmful: number) => ({
        withRuns,
        withHarmful,
        withoutRuns,
        withoutHarmful,
    });

    it("confirms as soon as the test passes", () => {
        expect(replayStatus(totals(5, 5, 5, 0), true)).toBe("confirmed");
    });

    it("keeps running before any rerun has finished", () => {
        expect(replayStatus(totals(0, 0, 0, 0), true)).toBe("running");
        expect(replayStatus(totals(0, 0, 0, 0), false)).toBe("running");
    });

    it("keeps running while the test can still pass", () => {
        expect(replayStatus(totals(5, 4, 5, 0), true)).toBe("running");
    });

    it("gives up after 10 reruns with the content and no harm", () => {
        expect(replayStatus(totals(10, 0, 10, 0), false)).toBe("could not reproduce");
    });

    it("stops early when even a perfect finish could not pass the test", () => {
        expect(replayStatus(totals(15, 2, 15, 4), false)).toBe("not confirmed");
    });

    it("stops at 20 reruns with the content once nothing is still running", () => {
        expect(replayStatus(totals(20, 6, 15, 0), false)).toBe("not confirmed");
        expect(replayStatus(totals(20, 6, 15, 0), true)).toBe("running");
    });
});
