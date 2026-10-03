// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR } from "@/lib/time";
import { columnsOf, rectsOf } from "../../../../test/charts-layout-hooks/paths";
import { BAND_ROWS, bucketNames, columnsLayout, groupAt, groupOverlay, groupX, mergeValues } from "./columns";

// 8px cells sit 10px apart, so 118px holds 12 columns: 4 groups of 3
const base = {
    values: [1, 2, 3, 4],
    plotWidth: 118,
    dataRows: 4,
    preferredCell: 8,
    emphasis: "all" as const,
    peakTextWidth: 0,
};

describe("mergeValues", () => {
    it("sums neighbors into groups of the given size, keeping a short last group", () => {
        expect(mergeValues([1, 2, 3, 4, 5], 2)).toEqual([3, 7, 5]);
        expect(mergeValues([1, 2], 1)).toEqual([1, 2]);
        expect(mergeValues([], 3)).toEqual([]);
    });
});

describe("columnsLayout", () => {
    it("gives each value a group of columns with one unlit gutter column", () => {
        const layout = columnsLayout(base);
        expect(layout).toMatchObject({ cell: 8, pitch: 10, groups: [1, 2, 3, 4], merge: 1, span: 3, lit: 2 });
        expect(layout.dataWidth).toBe(118);
        // Gutter columns 20, 50, 80 and 110 never light
        expect(columnsOf(layout.field.lit.lit)).toEqual([0, 10, 30, 40, 60, 70, 90, 100]);
    });

    it("puts three clean ticks on the scale", () => {
        // The highest value 4 rounds up to a scale of 6, so each of the 4 rows is 1.5
        const layout = columnsLayout(base);
        expect(layout.unit).toBe(1.5);
        expect(layout.ticks).toEqual([
            { value: 2, y: 58 },
            { value: 4, y: 38 },
            { value: 6, y: 28 },
        ]);
    });

    it("keeps every column lit when groups are too narrow for a gutter", () => {
        const layout = columnsLayout({ ...base, plotWidth: 78 });
        expect(layout.span).toBe(2);
        expect(layout.lit).toBe(2);
        expect(columnsOf(layout.field.lit.lit)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    });

    it("merges neighboring values when the width is short", () => {
        const values = Array.from({ length: 30 }, () => 1);
        const layout = columnsLayout({ ...base, values, plotWidth: 98 });
        expect(layout.merge).toBe(3);
        expect(layout.groups).toEqual(Array.from({ length: 10 }, () => 3));
    });

    it("colors the newest group apart when it is emphasized", () => {
        const layout = columnsLayout({ ...base, emphasis: "last" });
        expect(columnsOf(layout.field.lit.now)).toEqual([90, 100]);
        expect(columnsOf(layout.field.lit.lit)).toEqual([0, 10, 30, 40, 60, 70]);
    });

    it("has no peak label without label text", () => {
        expect(columnsLayout(base).peak).toBeNull();
    });

    it("has no peak label when every value is zero", () => {
        expect(columnsLayout({ ...base, values: [0, 0, 0, 0], peakTextWidth: 20 }).peak).toBeNull();
    });

    it("places the peak label over the highest group in the top band", () => {
        const layout = columnsLayout({ ...base, values: [1, 4, 2, 3], peakTextWidth: 10 });
        // 10px of text needs 3 columns, centered on group 1's lit columns
        expect(layout.peak).toEqual({
            index: 1,
            value: 4,
            label: { x: 20, y: 0, w: 28, h: BAND_ROWS * 10 - 2 },
        });
        expect(rectsOf(layout.field.field).some((r) => r.y < 30 && r.x >= 20 && r.x < 50)).toBe(false);
    });

    it("keeps the peak label inside the plot at the right edge", () => {
        const layout = columnsLayout({ ...base, peakTextWidth: 40 });
        expect(layout.peak?.label.x).toBe(60);
        expect(layout.peak?.label.w).toBe(58);
    });

    it("keeps the peak label inside the plot at the left edge", () => {
        const layout = columnsLayout({ ...base, values: [4, 1, 2, 3], peakTextWidth: 40 });
        expect(layout.peak?.label.x).toBe(0);
    });
});

describe("groupOverlay", () => {
    it("redraws only the lit columns of the hovered group", () => {
        const layout = columnsLayout(base);
        const { lit, unlit } = groupOverlay(layout, 3);
        // Value 4 at 1.5 per row lights two whole cells and part of a third
        expect(columnsOf(lit)).toEqual([90, 100]);
        expect(rectsOf(lit)).toHaveLength(6);
        expect(columnsOf(unlit)).toEqual([90, 100]);
        expect(rectsOf(unlit)).toHaveLength(4);
    });
});

describe("groupX and groupAt", () => {
    const layout = columnsLayout(base);

    it("finds where a group starts", () => {
        expect(groupX(layout, 0)).toBe(0);
        expect(groupX(layout, 2)).toBe(60);
    });

    it("finds the group under a pointer, clamped to the plot", () => {
        expect(groupAt(layout, 65)).toBe(2);
        expect(groupAt(layout, -5)).toBe(0);
        expect(groupAt(layout, 1000)).toBe(3);
    });
});

describe("bucketNames", () => {
    const start = Date.UTC(2026, 9, 3, 10, 0);

    it("names hourly buckets by clock time", () => {
        const names = bucketNames(start, HOUR);
        expect(names.caption(start, start + HOUR)).toBe("10:00–11:00");
        expect(names.axis(start)).toBe("10:00");
        expect(names.start(2)).toBe(start + 2 * HOUR);
    });

    it("names a single day bucket by its date", () => {
        const names = bucketNames(start, DAY);
        expect(names.caption(start, start + DAY)).toBe("3 Oct");
        expect(names.axis(start)).toBe("3 Oct");
    });

    it("names merged day buckets by their first and last day", () => {
        const names = bucketNames(start, DAY);
        expect(names.caption(start, start + 3 * DAY)).toBe("3 Oct – 5 Oct");
        expect(names.start(1)).toBe(start + DAY);
    });
});
