// @vitest-environment node
import { describe, expect, it } from "vitest";
import { heroLayout } from "./hero";

// A day of 10-minute buckets
const DAY_BUCKETS = 144;
const zeros = () => Array<number>(DAY_BUCKETS).fill(0);
const ramp = () => Array.from({ length: DAY_BUCKETS }, (_, i) => i);

function withPeak(index: number, value: number) {
    const values = zeros();
    values[index] = value;
    return values;
}

describe("heroLayout on a wide screen", () => {
    const hero = heroLayout(withPeak(50, 140), 1300);

    it("keeps one column per bucket at the widest pitch", () => {
        expect(hero.bucketSize).toBe(1);
        expect(hero.buckets).toHaveLength(DAY_BUCKETS);
        expect(hero.field.pitch).toBe(8);
    });

    it("spans the given width exactly by widening the last margin columns", () => {
        expect(hero.field.width).toBe(1300);
        expect(hero.field.columnW).toHaveLength(162);
        expect(hero.field.columnW.slice(-7)).toEqual([6, 7, 7, 7, 7, 7, 7]);
    });

    it("is as tall as the data rows plus the band rows", () => {
        // 30 data rows and 4 band rows at pitch 8, less the last gap
        expect(hero.field.height).toBe(270);
    });

    it("scales to clean ticks above the peak", () => {
        expect(hero).toMatchObject({ max: 150, step: 50, unit: 5 });
        expect(hero.ticks).toEqual([
            { value: 50, y: 190 },
            { value: 100, y: 110 },
            { value: 150, y: 30 },
        ]);
    });

    it("finds the peak bucket", () => {
        expect(hero.peak).toEqual({ index: 50, value: 140 });
    });

    it("lights one cell per unit in the peak column", () => {
        // 140 at 5 per cell is 28 whole cells
        expect(hero.field.lit.lit.match(/M/g)).toHaveLength(28);
        expect(hero.field.lit.lit.startsWith("M400 ")).toBe(true);
    });

    it("puts a two-row cursor in the first column after the data", () => {
        expect(hero.cursor).toEqual({ x: 1152, y: 256, w: 6, h: 14 });
    });

    it("rounds the top-left corner but not the bottom-left one", () => {
        expect(hero.field.field).not.toContain("M0 0h6v6h-6z");
        expect(hero.field.field).toContain("M0 264h6v6h-6z");
    });
});

describe("heroLayout on narrower screens", () => {
    it("merges pairs of buckets when single columns would be too thin", () => {
        const hero = heroLayout(ramp(), 600);
        expect(hero.bucketSize).toBe(2);
        expect(hero.field.pitch).toBe(7);
        expect(hero.buckets).toHaveLength(72);
        expect(hero.buckets.slice(0, 3)).toEqual([1, 5, 9]);
        expect(hero.peak).toEqual({ index: 71, value: 285 });
        expect(hero.field.width).toBe(600);
    });

    it("merges six buckets into an hour on a phone", () => {
        const hero = heroLayout(ramp(), 200);
        expect(hero.bucketSize).toBe(6);
        expect(hero.field.pitch).toBe(5);
        expect(hero.buckets).toHaveLength(24);
        expect(hero.buckets[0]).toBe(15);
        expect(hero.field.width).toBe(200);
    });

    it("falls back to hourly columns at the smallest pitch when nothing fits", () => {
        const hero = heroLayout(ramp(), 100);
        expect(hero.bucketSize).toBe(6);
        expect(hero.field.pitch).toBe(5);
        expect(hero.buckets).toHaveLength(24);
        // Eight margin columns always follow the data
        expect(hero.field.columnW).toHaveLength(24 + 8);
    });
});

describe("heroLayout with no traffic", () => {
    it("still draws a scale and lights nothing", () => {
        const hero = heroLayout(zeros(), 1300);
        expect(hero.max).toBe(1.2);
        expect(hero.field.lit).toEqual({});
        expect(hero.peak).toEqual({ index: 0, value: 0 });
    });
});
