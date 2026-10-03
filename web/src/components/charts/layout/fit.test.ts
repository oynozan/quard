// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fitCells } from "./fit";

// Cells sit 2px apart, so an 8px cell takes 10px of width

describe("fitCells", () => {
    it("keeps the preferred cell when it fills the width exactly", () => {
        expect(fitCells(118, 4, 8)).toEqual({ cell: 8, span: 3 });
    });

    it("goes one size up when that fills the width and the preferred size does not", () => {
        // 8px leaves a quarter of the width empty, 9px fills it
        expect(fitCells(38, 3, 8)).toEqual({ cell: 9, span: 1 });
    });

    it("goes one size down when that fills the width best", () => {
        // 8px fits 8 columns for 3 groups (2 left over), 7px fits 9
        expect(fitCells(80, 3, 8)).toEqual({ cell: 7, span: 3 });
    });

    it("picks the size with the least space left when none is close", () => {
        // 8px and 7px leave 40% empty, 9px leaves 25%
        expect(fitCells(48, 3, 8)).toMatchObject({ cell: 9, span: 1 });
    });

    it("falls back to one preferred cell per group when the groups do not fit", () => {
        expect(fitCells(10, 5, 8)).toEqual({ cell: 8, span: 1 });
    });

    it("never goes below 3px cells", () => {
        // 2px cells would fit 3 groups here, but 3px and 4px do not, so it falls back
        expect(fitCells(10, 3, 3)).toEqual({ cell: 3, span: 1 });
    });
});
