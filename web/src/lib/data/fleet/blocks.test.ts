// @vitest-environment node
import { describe, expect, it } from "vitest";
import { START_AT, emptyFleet, heatmapOf } from "../../../../test/summary/fleet";
import { DAY, HOUR, NOW } from "../../../../test/time";
import { blocksOf, windowStart, WINDOW_DAYS } from "./blocks";

// Whole hours since the epoch, as the query counts them
const hourAt = (time: number) => time / HOUR;

describe("windowStart", () => {
    it("starts at UTC midnight 29 days back, so today is the 30th day", () => {
        expect(WINDOW_DAYS).toBe(30);
        expect(windowStart(NOW)).toBe(START_AT);
        expect(windowStart(Date.UTC(2026, 9, 3))).toBe(START_AT);
        expect(windowStart(Date.UTC(2026, 9, 3) - 1)).toBe(START_AT - DAY);
    });
});

describe("blocksOf", () => {
    it("gives the six guards 30 empty days and an empty grid when nothing was blocked", () => {
        const { byGuard, heatmap } = blocksOf([], START_AT);

        expect(byGuard).toEqual(emptyFleet().blocksByGuard);
        expect(heatmap).toEqual(heatmapOf([]));
    });

    it("adds each guard's blocks to its UTC day, and all of them to the weekday and hour", () => {
        const monday = START_AT + 3 * DAY + 14 * HOUR;
        const { byGuard, heatmap } = blocksOf(
            [
                { guard: "egress", hour: hourAt(START_AT), blocks: 2 },
                { guard: "source", hour: hourAt(monday), blocks: 5 },
                { guard: "egress", hour: hourAt(monday), blocks: 1 },
                { guard: "permission", hour: hourAt(START_AT + 29 * DAY + 23 * HOUR), blocks: 4 },
            ],
            START_AT,
        );

        expect(byGuard.series.map((row) => [row.guard, row.total])).toEqual([
            ["source", 5],
            ["action", 0],
            ["egress", 3],
            ["limit", 0],
            ["approval", 0],
            ["permission", 4],
        ]);
        expect(byGuard.series[2].values.slice(0, 4)).toEqual([2, 0, 0, 1]);
        expect(byGuard.series[5].values[29]).toBe(4);
        expect(byGuard.totals.slice(0, 4)).toEqual([2, 0, 0, 6]);
        expect(byGuard.totals[29]).toBe(4);
        // Friday 4 Sep at 00:00, Monday 7 Sep at 14:00 and Saturday 3 Oct at 23:00
        expect(heatmap).toEqual(
            heatmapOf([
                [4, 0, 2],
                [0, 14, 6],
                [5, 23, 4],
            ]),
        );
    });

    it("leaves out guards the summary does not show and hours outside the window", () => {
        const { byGuard, heatmap } = blocksOf(
            [
                { guard: "signature", hour: hourAt(START_AT), blocks: 9 },
                { guard: "source", hour: hourAt(START_AT) - 1, blocks: 9 },
                { guard: "source", hour: hourAt(START_AT + 30 * DAY), blocks: 9 },
            ],
            START_AT,
        );

        expect(byGuard).toEqual(emptyFleet().blocksByGuard);
        expect(heatmap.total).toBe(0);
    });
});
