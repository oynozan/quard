// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allocateParts } from "./allocate";

describe("allocateParts", () => {
    it("splits a total by weight when it divides evenly", () => {
        expect(allocateParts([1, 2, 1], 8)).toEqual([2, 4, 2]);
    });

    it("gives the leftover units to the largest remainders, so parts add up to the total", () => {
        const parts = allocateParts([1, 1, 1], 10);

        expect(parts).toEqual([4, 3, 3]);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(10);
    });

    it("prefers the part whose exact share was cut the most", () => {
        // Exact shares are 1.4, 2.8 and 2.8: the two 0.8 remainders get the two spare units.
        expect(allocateParts([1, 2, 2], 7)).toEqual([1, 3, 3]);
    });

    it("gives zero to every part when there is nothing to split", () => {
        expect(allocateParts([3, 2], 0)).toEqual([0, 0]);
        expect(allocateParts([3, 2], -4)).toEqual([0, 0]);
    });

    it("gives zero to every part when no weight is above zero", () => {
        expect(allocateParts([0, 0, 0], 5)).toEqual([0, 0, 0]);
    });
});
