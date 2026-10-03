// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rectsOf } from "../../../../test/charts-layout-hooks/paths";
import { DEFAULT_STEPS, HEAT_FILLS, heatLayout, heatStep, ringPath, TOTALS_GAP } from "./heatmap";

describe("heatStep", () => {
    it("leaves zero and below unlit", () => {
        expect(heatStep(0, DEFAULT_STEPS)).toBe(0);
        expect(heatStep(-4, DEFAULT_STEPS)).toBe(0);
    });

    it("lights any value above zero at least Heat 1", () => {
        expect(heatStep(0.5, DEFAULT_STEPS)).toBe(1);
        expect(heatStep(14, DEFAULT_STEPS)).toBe(1);
    });

    it("moves up a step at each lower bound", () => {
        expect(heatStep(15, DEFAULT_STEPS)).toBe(2);
        expect(heatStep(44, DEFAULT_STEPS)).toBe(3);
        expect(heatStep(45, DEFAULT_STEPS)).toBe(4);
        expect(heatStep(60, DEFAULT_STEPS)).toBe(5);
        expect(heatStep(1000, DEFAULT_STEPS)).toBe(5);
    });

    it("follows custom steps", () => {
        expect(heatStep(3, [1, 2, 3, 4, 5])).toBe(3);
    });
});

describe("heatLayout", () => {
    const values = [
        [0, 20, 60],
        [60, 0],
    ];

    it("uses 16px cells when there is room", () => {
        const layout = heatLayout({ values, cols: 3, available: 1000, steps: DEFAULT_STEPS, totals: false });
        expect(layout).toMatchObject({ cell: 16, pitch: 18, width: 52, gridHeight: 34, height: 34 });
    });

    it("shrinks cells to fit, down to 8px", () => {
        const fit = heatLayout({ values, cols: 3, available: 40, steps: DEFAULT_STEPS, totals: false });
        expect(fit.cell).toBe(12);
        const narrow = heatLayout({ values, cols: 3, available: 10, steps: DEFAULT_STEPS, totals: false });
        expect(narrow.cell).toBe(8);
    });

    it("groups cells into one path per heat color, treating missing values as zero", () => {
        const layout = heatLayout({ values, cols: 3, available: 1000, steps: DEFAULT_STEPS, totals: false });
        expect(layout.paths).toHaveLength(HEAT_FILLS.length);
        const at = (step: number) => rectsOf(layout.paths[step]).map((r) => [r.y / 18, r.x / 18]);
        expect(at(0)).toEqual([
            [0, 0],
            [1, 1],
            [1, 2],
        ]);
        expect(at(2)).toEqual([[0, 1]]);
        expect(at(5)).toEqual([
            [0, 2],
            [1, 0],
        ]);
        expect(layout.paths[1]).toBe("");
    });

    it("finds the rectangle of a cell by row and column", () => {
        const layout = heatLayout({ values, cols: 3, available: 1000, steps: DEFAULT_STEPS, totals: false });
        expect(layout.cellRect(1, 2)).toEqual({ x: 36, y: 18, w: 16, h: 16 });
    });

    it("has no totals strip unless asked", () => {
        const layout = heatLayout({ values, cols: 3, available: 1000, steps: DEFAULT_STEPS, totals: false });
        expect(layout.totals).toBeNull();
    });

    it("adds a strip under the grid that fills each column by its share of the busiest", () => {
        const layout = heatLayout({ values, cols: 4, available: 1000, steps: DEFAULT_STEPS, totals: true });
        const y = 34 + TOTALS_GAP;
        expect(layout.height).toBe(y + 16);
        expect(rectsOf(layout.totals!.field)).toHaveLength(4);
        // Column sums are 60, 20, 60 and 0, so 20 fills a third of a cell and 0 fills none
        expect(rectsOf(layout.totals!.fill)).toEqual([
            { x: 0, y, w: 16, h: 16 },
            { x: 18, y: y + 10.5, w: 16, h: 5.5 },
            { x: 36, y, w: 16, h: 16 },
        ]);
    });

    it("leaves the strip empty when every column sums to zero", () => {
        const layout = heatLayout({ values: [[0, 0]], cols: 2, available: 1000, steps: DEFAULT_STEPS, totals: true });
        expect(rectsOf(layout.totals!.field)).toHaveLength(2);
        expect(layout.totals!.fill).toBe("");
    });

    it("fills a tiny column total at least half a pixel tall", () => {
        const layout = heatLayout({
            values: [[1000, 1]],
            cols: 2,
            available: 1000,
            steps: DEFAULT_STEPS,
            totals: true,
        });
        expect(rectsOf(layout.totals!.fill)[1].h).toBe(0.5);
    });
});

describe("ringPath", () => {
    it("draws four 1px sides just outside the cell", () => {
        expect(rectsOf(ringPath({ x: 10, y: 20, w: 16, h: 16 }))).toEqual([
            { x: 9, y: 19, w: 18, h: 1 },
            { x: 9, y: 36, w: 18, h: 1 },
            { x: 9, y: 20, w: 1, h: 16 },
            { x: 26, y: 20, w: 1, h: 16 },
        ]);
    });
});
