// @vitest-environment node
import { describe, expect, it } from "vitest";
import { overlaps } from "@/lib/charts/cells";
import { columnsOf, rectsOf } from "../../../../test/charts-layout-hooks/paths";
import { binOverlay, histogramLayout, labelEvery } from "./histogram";

// 8px cells sit 10px apart, so 118px holds 12 columns: 4 bins of 3
const base = { bins: [2, 4, 6, 8], plotWidth: 118, dataRows: 3, preferredCell: 8, markers: [] };
const marker = (position: number, text = "p50") => ({ text, position, textWidth: 20 });
const BAND = 28;

describe("histogramLayout", () => {
    it("gives each bin touching columns with no gutter", () => {
        const layout = histogramLayout(base);
        expect(layout).toMatchObject({ cell: 8, pitch: 10, span: 3, dataRows: 3, dataWidth: 118 });
        expect(columnsOf(layout.field.lit.lit)).toHaveLength(12);
    });

    it("puts three clean ticks on the scale", () => {
        // The highest bin 8 rounds up to a scale of 9, so each of the 3 rows is 3
        const layout = histogramLayout(base);
        expect(layout.unit).toBe(3);
        expect(layout.ticks).toEqual([
            { value: 3, y: 48 },
            { value: 6, y: 38 },
            { value: 9, y: 28 },
        ]);
    });

    it("has no markers unless given some", () => {
        expect(histogramLayout(base).markers).toEqual([]);
    });

    it("places a marker's label after its line when there is room", () => {
        const [m] = histogramLayout({ ...base, markers: [marker(1.5)] }).markers;
        expect(m.text).toBe("p50");
        expect(m.x).toBe(40);
        expect(m.label).toEqual({ x: 40, y: 0, w: 28, h: BAND });
    });

    it("draws the marker line as one dash per data row, just left of its column", () => {
        const [m] = histogramLayout({ ...base, markers: [marker(1.5)] }).markers;
        expect(rectsOf(m.dashes)).toEqual([
            { x: 38.5, y: 30, w: 1, h: 8 },
            { x: 38.5, y: 40, w: 1, h: 8 },
            { x: 38.5, y: 50, w: 1, h: 8 },
        ]);
    });

    it("knocks the label out of the field", () => {
        const layout = histogramLayout({ ...base, markers: [marker(1.5)] });
        const label = layout.markers[0].label!;
        expect(rectsOf(layout.field.field).some((r) => overlaps(r, label))).toBe(false);
    });

    it("places the label before the line near the right edge", () => {
        const [m] = histogramLayout({ ...base, markers: [marker(3.9)] }).markers;
        expect(m.x).toBe(110);
        expect(m.label).toEqual({ x: 80, y: 0, w: 28, h: BAND });
    });

    it("moves a label before its line to avoid an earlier label", () => {
        const [, second] = histogramLayout({ ...base, markers: [marker(1.5), marker(1.6, "p90")] }).markers;
        expect(second.label).toEqual({ x: 10, y: 0, w: 28, h: BAND });
    });

    it("drops a label that fits on neither side, keeping its line", () => {
        const [first, second] = histogramLayout({ ...base, markers: [marker(0), marker(0, "p90")] }).markers;
        expect(first.label).toEqual({ x: 0, y: 0, w: 28, h: BAND });
        expect(second.label).toBeNull();
        expect(second.text).toBe("p90");
        // The first column's line stays on the plot
        expect(rectsOf(second.dashes)[0].x).toBe(0);
    });

    it("clamps markers outside the bins to the first and last column", () => {
        const [before, after] = histogramLayout({ ...base, markers: [marker(-1), marker(10)] }).markers;
        expect(before.x).toBe(0);
        expect(after.x).toBe(110);
    });

    it("draws a fully unlit field when every bin is empty", () => {
        const layout = histogramLayout({ ...base, bins: [0, 0, 0, 0] });
        expect(layout.field.lit).toEqual({});
        // 12 columns of 3 band rows and 3 data rows
        expect(rectsOf(layout.field.field)).toHaveLength(72);
    });
});

describe("binOverlay", () => {
    it("redraws every column of the hovered bin", () => {
        const layout = histogramLayout(base);
        // Value 4 at 3 per row lights one whole cell and part of the next
        const { lit, unlit } = binOverlay(layout, 1, 4);
        expect(columnsOf(lit)).toEqual([30, 40, 50]);
        expect(rectsOf(lit)).toHaveLength(6);
        expect(columnsOf(unlit)).toEqual([30, 40, 50]);
        expect(rectsOf(unlit)).toHaveLength(6);
    });
});

describe("labelEvery", () => {
    it("labels every bin when the labels fit", () => {
        expect(labelEvery([20, 20, 20, 20], 40)).toBe(1);
    });

    it("skips bins until the labels shown sit apart", () => {
        expect(labelEvery([20, 20, 20, 20], 20)).toBe(2);
    });

    it("steps far enough to clear the first label, which always shows", () => {
        expect(labelEvery([50, 10, 10, 10, 10], 10)).toBe(10);
    });

    it("ignores a wide label that the step skips", () => {
        // Every second bin shows labels 0 and 2, so the wide label 1 never shows
        expect(labelEvery([10, 50, 10, 10], 12)).toBe(2);
    });

    it("labels every bin when there are no labels", () => {
        expect(labelEvery([], 12)).toBe(1);
    });

    it("falls back to every hundredth bin when nothing fits", () => {
        expect(labelEvery([5000], 1)).toBe(100);
    });
});
