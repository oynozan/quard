import { describe, expect, it } from "vitest";
import { fisherOneSided } from "./fisher.ts";

describe("fisherOneSided", () => {
    it.each([
        ["5 of 5 harmful with the content and none without", [5, 5, 0, 5], 1 / 252],
        ["4 of 5 harmful with the content and none without", [4, 5, 0, 5], 5 / 210],
        ["no harm on either side", [0, 5, 0, 5], 1],
        ["harm only without the content", [0, 5, 5, 5], 1],
    ] as const)("gives the chance of %s", (_what, [harmfulWith, runsWith, harmfulWithout, runsWithout], p) => {
        expect(fisherOneSided(harmfulWith, runsWith, harmfulWithout, runsWithout)).toBeCloseTo(p, 12);
    });

    it("never goes above 1", () => {
        expect(fisherOneSided(1, 20, 19, 20)).toBeLessThanOrEqual(1);
    });
});
