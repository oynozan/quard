// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blockRates, bucketSeries } from "./series";

describe("bucketSeries", () => {
    it("puts each count in its bucket, oldest first, with empty buckets as 0", () => {
        const rows = [
            { bucket: 0, count: 2 },
            { bucket: 3, count: 5 },
        ];

        expect(bucketSeries(rows, 5)).toEqual([2, 0, 0, 5, 0]);
    });

    it("gives no series when nothing happened, so no chart is drawn", () => {
        expect(bucketSeries([], 144)).toEqual([]);
    });
});

describe("blockRates", () => {
    it("gives the percent of calls blocked each day, with days without calls as 0", () => {
        const days = [
            { day: 0, calls: 4, blocked: 1 },
            { day: 2, calls: 8, blocked: 8 },
        ];

        expect(blockRates(days, 4)).toEqual([25, 0, 100, 0]);
    });

    it("keeps a day of calls with nothing blocked as a real 0%", () => {
        expect(blockRates([{ day: 29, calls: 3, blocked: 0 }], 30)).toEqual(Array<number>(30).fill(0));
    });

    it("gives no series when no day had calls", () => {
        expect(blockRates([], 30)).toEqual([]);
        expect(blockRates([{ day: 1, calls: 0, blocked: 0 }], 30)).toEqual([]);
    });
});
