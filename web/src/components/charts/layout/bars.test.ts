// @vitest-environment node
import { describe, expect, it } from "vitest";
import { columnsOf, rectsOf } from "../../../../test/charts-layout-hooks/paths";
import { barsLayout } from "./bars";

// 8px cells sit 10px apart, so a 98px track holds exactly 10 cells
const base = { trackWidth: 98, cell: 8, textWidth: 0 };

describe("barsLayout", () => {
    it("fits whole cells into the track and trims the leftover width", () => {
        // 105px holds 10 cells with 7px to spare
        const layout = barsLayout({ ...base, trackWidth: 105, values: [1] });
        expect(layout).toMatchObject({ cell: 8, pitch: 10, cells: 10, trackWidth: 98 });
    });

    it("lights the biggest value across the whole track", () => {
        const [row] = barsLayout({ ...base, values: [10, 5] }).rows;
        expect(columnsOf(row.lit)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
        expect(row.field).toBe("");
        expect(row.valueX).toBe(105);
    });

    it("lights whole cells for a value that lands on a cell edge", () => {
        const [, row] = barsLayout({ ...base, values: [10, 5] }).rows;
        expect(columnsOf(row.lit)).toEqual([0, 10, 20, 30, 40]);
        expect(columnsOf(row.field)).toEqual([50, 60, 70, 80, 90]);
        expect(row.valueX).toBe(55);
    });

    it("lights part of the next cell for a value between cell edges", () => {
        const [, row] = barsLayout({ ...base, values: [10, 2.5] }).rows;
        const lit = rectsOf(row.lit);
        expect(lit).toHaveLength(3);
        expect(lit[2]).toEqual({ x: 20, y: 0, w: 4, h: 8 });
        // The partly lit cell keeps its unlit square behind it
        expect(columnsOf(row.field)[0]).toBe(20);
        expect(row.valueX).toBe(35);
    });

    it("draws a tiny value at least half a pixel wide", () => {
        const [, row] = barsLayout({ ...base, values: [1000, 1] }).rows;
        expect(rectsOf(row.lit)).toEqual([{ x: 0, y: 0, w: 0.5, h: 8 }]);
    });

    it("leaves zero and negative values unlit", () => {
        const rows = barsLayout({ ...base, values: [4, 0, -3] }).rows;
        for (const row of rows.slice(1)) {
            expect(row.lit).toBe("");
            expect(rectsOf(row.field)).toHaveLength(10);
            expect(row.valueX).toBe(5);
        }
    });

    it("leaves room for the value text right after each bar", () => {
        // 15px of text knocks out 3 cells, so bars use the other 7
        const rows = barsLayout({ ...base, textWidth: 15, values: [7, 2] }).rows;
        expect(columnsOf(rows[0].lit)).toEqual([0, 10, 20, 30, 40, 50, 60]);
        expect(rows[0].field).toBe("");
        expect(columnsOf(rows[1].lit)).toEqual([0, 10]);
        expect(columnsOf(rows[1].field)).toEqual([50, 60, 70, 80, 90]);
    });

    it("scales to a given maximum instead of the biggest value", () => {
        const [row] = barsLayout({ ...base, values: [5], max: 10 }).rows;
        expect(columnsOf(row.lit)).toEqual([0, 10, 20, 30, 40]);
    });

    it("stops a value above the given maximum at the end of the track", () => {
        const [row] = barsLayout({ ...base, values: [12.5], max: 10 }).rows;
        expect(rectsOf(row.lit)).toHaveLength(10);
        expect(rectsOf(row.lit).every((r) => r.w === 8)).toBe(true);
        expect(row.field).toBe("");
        expect(row.valueX).toBe(105);
    });

    it("keeps at least four cells on a very short track", () => {
        const layout = barsLayout({ ...base, trackWidth: 10, values: [1] });
        expect(layout.cells).toBe(4);
        expect(layout.trackWidth).toBe(38);
    });

    it("keeps one usable cell when the text is wider than the track", () => {
        const [row] = barsLayout({ ...base, textWidth: 500, values: [3] }).rows;
        expect(columnsOf(row.lit)).toEqual([0]);
        expect(row.field).toBe("");
    });

    it("leaves every row unlit when all values are zero", () => {
        const rows = barsLayout({ ...base, values: [0, 0] }).rows;
        expect(rows.map((r) => r.lit)).toEqual(["", ""]);
        expect(rectsOf(rows[0].field)).toHaveLength(10);
        expect(rows[0].valueX).toBe(5);
    });
});
