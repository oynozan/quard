// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Rect } from "@/lib/charts/cells";
import { columnsOf } from "../../../../test/charts-layout-hooks/paths";
import { centerKnockout, columnCells, sweepPaths, SWEEP_REACH } from "./sweep";

// One 1px cell per column, at x = column
const oneCell = (column: number): Rect[] => [{ x: column, y: 0, w: 1, h: 1 }];

describe("sweepPaths", () => {
    it("draws nothing while the sweep is idle", () => {
        expect(sweepPaths(null, 30, oneCell)).toEqual([]);
    });

    // Columns 3 to 17 light, seven either side of column 10
    it("brightens columns more the closer they are to the center", () => {
        const [near, mid, far] = sweepPaths(10, 30, oneCell);
        expect(near.fill).toBe("var(--segment-off)");
        expect(columnsOf(near.d)).toEqual([8, 9, 10, 11, 12]);
        expect(mid.fill).toBe("var(--line)");
        expect(columnsOf(mid.d)).toEqual([6, 7, 13, 14]);
        expect(far.fill).toBe("var(--control)");
        expect(columnsOf(far.d)).toEqual([3, 4, 5, 15, 16, 17]);
    });

    it("stops at the edges of the field", () => {
        const [near, mid, far] = sweepPaths(0, 4, oneCell);
        expect(columnsOf(near.d)).toEqual([0, 1, 2]);
        expect(columnsOf(mid.d)).toEqual([3]);
        expect(far.d).toBe("");
    });

    it("lights only the faint edge while the center is still off the field", () => {
        const paths = sweepPaths(-SWEEP_REACH, 30, oneCell);
        expect(paths.map((p) => columnsOf(p.d))).toEqual([[], [], [0]]);
    });
});

describe("columnCells", () => {
    it("lists one cell per row from the top", () => {
        expect(columnCells(5, 8, 3, 10)).toEqual([
            { x: 5, y: 0, w: 8, h: 8 },
            { x: 5, y: 10, w: 8, h: 8 },
            { x: 5, y: 20, w: 8, h: 8 },
        ]);
    });
});

describe("centerKnockout", () => {
    it("centers a box of whole cells with a cell of room around the text", () => {
        // A 10 by 6 field; 25px of text needs 5 columns and 12px needs 3 rows
        expect(centerKnockout(98, 58, 10, 25, 12)).toEqual({ x: 20, y: 10, w: 48, h: 28 });
    });

    it("never grows past the field", () => {
        expect(centerKnockout(98, 58, 10, 500, 500)).toEqual({ x: 0, y: 0, w: 98, h: 58 });
    });
});
