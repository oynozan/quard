// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    columnField,
    columnOverlay,
    GAP,
    gridlineY,
    insideRounded,
    niceScale,
    overlaps,
    pathFor,
    snap,
    stripWidths,
} from "./cells";

// A 4px cell at x, y
const at = (x: number, y: number, h = 4, w = 4) => ({ x, y, w, h });

// Two columns, three data rows, 4px cells: pitch 6
const SMALL = { values: [2, 1.5], dataRows: 3, cell: 4, unit: 1 };

describe("pathFor", () => {
    it("draws each rectangle as one closed subpath", () => {
        expect(pathFor([at(1, 2, 4, 3), at(10, 0)])).toBe("M1 2h3v4h-3zM10 0h4v4h-4z");
    });

    it("is empty for no rectangles", () => {
        expect(pathFor([])).toBe("");
    });
});

describe("snap", () => {
    it("rounds to the nearest half pixel", () => {
        expect(snap(1.26)).toBe(1.5);
        expect(snap(1.24)).toBe(1);
    });
});

describe("niceScale", () => {
    it("picks three clean steps above the highest value", () => {
        expect(niceScale(140)).toEqual({ max: 150, step: 50 });
        expect(niceScale(7)).toEqual({ max: 9, step: 3 });
    });

    it("takes another step count", () => {
        expect(niceScale(140, 4)).toEqual({ max: 160, step: 40 });
    });

    it("still gives a usable scale with no data, without float noise", () => {
        expect(niceScale(0)).toEqual({ max: 1.2, step: 0.4 });
    });
});

describe("stripWidths", () => {
    it("spans the track exactly, spreading leftover pixels evenly", () => {
        const widths = stripWidths(100, 7);
        expect(widths).toEqual([13, 12, 13, 12, 13, 12, 13]);
        expect(widths.reduce((sum, w) => sum + w, 0) + GAP * 6).toBe(100);
    });

    it("takes another gap", () => {
        expect(stripWidths(12, 3, 0)).toEqual([4, 4, 4]);
    });

    it("never makes a cell narrower than one pixel", () => {
        expect(stripWidths(10, 10)).toEqual(Array(10).fill(1));
    });
});

describe("insideRounded", () => {
    const corners = { radius: 10, tl: true, tr: true, br: true, bl: true };

    it("cuts points outside each rounded corner", () => {
        expect(insideRounded(1, 1, 100, 50, corners)).toBe(false);
        expect(insideRounded(99, 1, 100, 50, corners)).toBe(false);
        expect(insideRounded(99, 49, 100, 50, corners)).toBe(false);
        expect(insideRounded(1, 49, 100, 50, corners)).toBe(false);
    });

    it("keeps points inside the curve of a corner", () => {
        expect(insideRounded(5, 5, 100, 50, corners)).toBe(true);
        expect(insideRounded(95, 45, 100, 50, corners)).toBe(true);
    });

    it("keeps points away from the corners", () => {
        expect(insideRounded(50, 25, 100, 50, corners)).toBe(true);
    });

    it("keeps square corners whole", () => {
        expect(insideRounded(1, 1, 100, 50, { radius: 10 })).toBe(true);
    });
});

describe("overlaps", () => {
    it("is true only when rectangles share area, not just an edge", () => {
        expect(overlaps(at(0, 0), at(3, 3))).toBe(true);
        expect(overlaps(at(0, 0), at(4, 0))).toBe(false);
        expect(overlaps(at(0, 0), at(0, 4))).toBe(false);
    });
});

describe("columnField", () => {
    it("lights whole cells, then part of the next cell from its bottom", () => {
        const f = columnField(SMALL);
        expect(f).toMatchObject({ width: 10, height: 16, pitch: 6, columnX: [0, 6], columnW: [4, 4] });
        expect(f.field).toBe(pathFor([at(0, 0), at(6, 0), at(6, 6)]));
        // Column 1 holds 1.5: one whole cell and a 2px slice of the cell above
        expect(f.lit).toEqual({ lit: pathFor([at(0, 6), at(0, 12), at(6, 8, 2), at(6, 12)]) });
        expect(f.rowTop(0)).toBe(12);
        expect(f.rowTop(2)).toBe(0);
    });

    it("lights at least half a pixel for a tiny value", () => {
        const f = columnField({ values: [0.05], dataRows: 1, cell: 4, unit: 1 });
        expect(f.lit.lit).toBe(pathFor([at(0, 3.5, 0.5)]));
    });

    it("uses custom widths, band rows, trailing columns and colors", () => {
        const f = columnField({
            values: [5, 1.5, -2],
            dataRows: 3,
            bandRows: 1,
            cell: 4,
            unit: 1,
            columnWidths: [6],
            trailingColumns: 1,
            colorOf: (col) => (col === 0 ? "hot" : "lit"),
        });
        expect(f).toMatchObject({ width: 24, height: 22, columnX: [0, 8, 14, 20], columnW: [6, 4, 4, 4] });
        // A value above the top fills only the data rows, never the band row
        expect(f.lit.hot).toBe(pathFor([at(0, 6, 4, 6), at(0, 12, 4, 6), at(0, 18, 4, 6)]));
        expect(f.lit.lit).toBe(pathFor([at(8, 14, 2), at(8, 18)]));
        // Negative values and trailing columns stay fully unlit
        expect(f.field.match(/M/g)).toHaveLength(12);
        expect(f.field).toContain(pathFor([at(14, 0), at(14, 6), at(14, 12), at(14, 18)]));
    });

    it("drops unlit cells cut by a corner or a knockout, but never lit ones", () => {
        const f = columnField({
            values: [0, 3],
            dataRows: 3,
            cell: 4,
            unit: 1,
            corners: { radius: 8, tl: true, tr: true },
            knockouts: [at(0, 6)],
        });
        // The top-left cell falls outside its corner and the middle one is knocked out
        expect(f.field).toBe(pathFor([at(0, 12)]));
        // The top-right cell is outside its corner too, but it is lit
        expect(f.lit.lit).toBe(pathFor([at(6, 0), at(6, 6), at(6, 12)]));
    });
});

describe("columnOverlay", () => {
    it("redraws one column with its unlit and lit cells apart", () => {
        const f = columnField(SMALL);
        expect(columnOverlay(f, 1, 1.5, 1, 3)).toEqual({
            unlit: pathFor([at(6, 0), at(6, 6)]),
            lit: pathFor([at(6, 8, 2), at(6, 12)]),
        });
    });

    it("shows a negative value as fully unlit", () => {
        const f = columnField(SMALL);
        expect(columnOverlay(f, 0, -1, 1, 3)).toEqual({ unlit: pathFor([at(0, 0), at(0, 6), at(0, 12)]), lit: "" });
    });

    it("leaves band rows out of the overlay", () => {
        const f = columnField({ values: [5], dataRows: 3, bandRows: 1, cell: 4, unit: 1 });
        expect(columnOverlay(f, 0, 5, 1, 3)).toEqual({ unlit: "", lit: pathFor([at(0, 6), at(0, 12), at(0, 18)]) });
    });
});

describe("gridlineY", () => {
    it("sits in the gap above the given row", () => {
        const f = columnField(SMALL);
        expect(gridlineY(f, 1)).toBe(10);
        expect(gridlineY(f, 2)).toBe(4);
        expect(gridlineY(f, 3)).toBe(-2);
    });
});
