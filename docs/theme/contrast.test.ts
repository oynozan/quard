import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";

describe("contrast", () => {
    it("gives 21:1 for black on white in either order", () => {
        expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
        expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
    });

    it("matches the ratio DESIGN.md gives for Signal Green on the page", () => {
        expect(contrast("#00da71", "#161616")).toBeCloseTo(9.71, 1);
    });
});
