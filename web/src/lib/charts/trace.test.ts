// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pathFor } from "./cells";
import { allocateCells, traceLayout } from "./trace";

const cellCount = (path: string) => (path.match(/M/g) ?? []).length;

// The 4px cells of one column, from its x and each cell's y
const column = (x: number, ...ys: number[]) => ys.map((y) => ({ x, y, w: 4, h: 4 }));

// 6 columns by 4 rows of 4px cells: pitch 6, so x and y step by 6
const INPUT = { values: [0, 10, 5], columns: 6, rows: 4, cell: 4 };

describe("traceLayout", () => {
    it("sizes the grid from the cell size and counts", () => {
        const t = traceLayout(INPUT);
        expect(t.pitch).toBe(6);
        expect(t.width).toBe(34);
        expect(t.height).toBe(22);
    });

    it("scales to a clean maximum above the highest value", () => {
        const t = traceLayout(INPUT);
        expect(t.max).toBe(12);
        expect(t.ticks.map((tick) => tick.value)).toEqual([4, 8, 12]);
        // Ticks sit in the row gap above rows 1, 3 and 4 (unit is 3)
        expect(t.ticks.map((tick) => tick.y)).toEqual([16, 4, -2]);
    });

    it("lights every row the line passes through in each column", () => {
        const t = traceLayout(INPUT);
        // Rows from the bottom are at y 18, 12, 6 and 0
        expect(t.lit).toBe(
            pathFor([
                // Column 0 spans 0 to 2: only the bottom row
                ...column(0, 18),
                // Column 1 climbs from 2 to 6
                ...column(6, 18, 12, 6),
                ...column(12, 6, 0),
                ...column(18, 6, 0),
                ...column(24, 6),
                // Column 5 runs from 6 down to 5
                ...column(30, 12, 6),
            ]),
        );
        expect(t.field.startsWith(pathFor(column(0, 12, 6, 0)))).toBe(true);
        expect(cellCount(t.field) + cellCount(t.lit)).toBe(24);
    });

    it("has no limit line or over-limit cells without a limit", () => {
        const t = traceLayout(INPUT);
        expect(t.limitY).toBeNull();
        expect(t.over).toBe("");
    });

    it("moves lit cells at or above the limit row into their own path", () => {
        const t = traceLayout({ ...INPUT, limit: 8 });
        // Limit 8 rounds to row 3, whose top gap is at y 4
        expect(t.limitY).toBe(4);
        expect(t.over).toBe(pathFor([...column(12, 0), ...column(18, 0)]));
        expect(cellCount(t.field) + cellCount(t.lit) + cellCount(t.over)).toBe(24);
    });

    it("lets a limit above the data raise the scale", () => {
        const t = traceLayout({ ...INPUT, limit: 40 });
        expect(t.max).toBe(60);
        expect(t.over).toBe("");
    });

    it("maps each data point to the column it falls in", () => {
        const t = traceLayout(INPUT);
        expect([0, 1, 2].map(t.columnOf)).toEqual([0, 2, 5]);
    });
});

describe("allocateCells", () => {
    it("gives nothing when every part is zero", () => {
        expect(allocateCells([0, 0, 0], 10)).toEqual([0, 0, 0]);
    });

    it("hands leftover cells to the largest remainders", () => {
        expect(allocateCells([1, 1, 1], 10)).toEqual([4, 3, 3]);
        expect(allocateCells([0, 5, 5], 3)).toEqual([0, 2, 1]);
    });

    it("splits exactly when the shares divide evenly", () => {
        expect(allocateCells([1, 3], 8)).toEqual([2, 6]);
    });

    it("gives a negative part no cells, even with the largest remainder", () => {
        // Exact shares are -0.1, 1.7, 1.7 and 1.7
        expect(allocateCells([-1, 17, 17, 17], 5)).toEqual([0, 2, 2, 1]);
    });

    it("gives tiny shares one cell, taken back from the biggest share", () => {
        expect(allocateCells([1, 1, 100], 3)).toEqual([1, 1, 1]);
        expect(allocateCells([1, 1, 1, 200], 5)).toEqual([1, 1, 1, 2]);
    });

    it("never gives a part raised to one cell a second cell over a larger part", () => {
        // Exact shares are 0.9, 1.5 and 1.6
        expect(allocateCells([9, 15, 16], 4)).toEqual([1, 1, 2]);
    });

    it("takes back from the smallest part when too few cells tie", () => {
        // Exact shares are 1.0, 0.9 and 0.1; each starts with one cell
        expect(allocateCells([10, 9, 1], 2)).toEqual([1, 1, 0]);
    });

    it("keeps the counts fair for many splits", () => {
        const splits = [
            [9, 15, 16],
            [10, 9, 1],
            [1, 2, 3],
            [5, 0, 7],
            [100, 1, 1],
            [3, 3, 94],
            [1, 49, 50],
            [7, 11, 13],
            [2, 1, 1, 1],
            [40, 30, 20, 10],
        ];
        for (const parts of splits) {
            const positive = parts.filter((p) => p > 0).length;
            for (let cells = 1; cells <= 40; cells++) {
                const counts = allocateCells(parts, cells);
                expect(counts.reduce((sum, c) => sum + c, 0)).toBe(cells);
                if (cells >= positive) parts.forEach((p, i) => expect(p > 0 ? counts[i] >= 1 : true).toBe(true));
                parts.forEach((p, i) =>
                    parts.forEach((q, j) => expect(p > q ? counts[i] >= counts[j] : true).toBe(true)),
                );
            }
        }
    });
});
