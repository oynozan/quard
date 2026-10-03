// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BLOCK_RATE_START, blockRatePerDay } from "../activity";
import { blockSeries } from "./series";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("blockSeries", () => {
    it("gives one value per day for each guard type, starting with the block-rate series", () => {
        const { byGuard } = blockSeries();

        expect(byGuard.startAt).toBe(BLOCK_RATE_START);
        expect(byGuard.series.map((row) => row.guard)).toEqual(["source", "action", "egress", "limit", "approval"]);
        for (const row of byGuard.series) {
            expect(row.values).toHaveLength(blockRatePerDay().length);
            expect(row.total).toBe(sum(row.values));
        }
    });

    it("splits each day's blocks across guard types without losing any", () => {
        const { byGuard } = blockSeries();

        byGuard.totals.forEach((total, day) => {
            expect(sum(byGuard.series.map((row) => row.values[day]))).toBe(total);
        });
    });

    it("blames most of the spike day's blocks on the source guard", () => {
        const { byGuard } = blockSeries();
        const spike = blockRatePerDay().findIndex((rate) => rate > 2);
        const [source, , , limit] = byGuard.series;

        expect(spike).toBeGreaterThan(-1);
        expect(source.values[spike]).toBeGreaterThan(2 * limit.values[spike]);
    });

    it("spreads the same blocks over a Monday-first week of UTC hours", () => {
        const { byGuard, heatmap } = blockSeries();

        expect(heatmap.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(heatmap.values).toHaveLength(7);
        expect(heatmap.values.every((row) => row.length === 24)).toBe(true);
        expect(heatmap.total).toBe(sum(byGuard.totals));
        expect(sum(heatmap.values.flat())).toBe(heatmap.total);
        expect(heatmap.max).toBe(Math.max(...heatmap.values.flat()));
        heatmap.hourTotals.forEach((total, hour) => {
            expect(total).toBe(sum(heatmap.values.map((row) => row[hour])));
        });
    });

    it("works the series out once and reuses it", () => {
        expect(blockSeries()).toBe(blockSeries());
    });
});
