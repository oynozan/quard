// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blockRatePerDay, BLOCK_RATE_START, modelCallsPer10Min, runsPerHour } from "./activity";
import { DAY, NOW } from "./rng";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => sum(values) / values.length;

describe("modelCallsPer10Min", () => {
    it("gives 144 whole, non-negative counts, the same every time", () => {
        const values = modelCallsPer10Min();
        expect(values).toHaveLength(144);
        expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
        expect(modelCallsPer10Min()).toEqual(values);
    });

    it("shows the two bursts above the slots around them", () => {
        const values = modelCallsPer10Min();
        expect(mean(values.slice(88, 94))).toBeGreaterThan(mean(values.slice(80, 88)) + 40);
        expect(mean(values.slice(118, 121))).toBeGreaterThan(mean(values.slice(112, 118)) + 25);
    });
});

describe("runsPerHour", () => {
    it("gives 24 whole counts, the same every time", () => {
        const values = runsPerHour();
        expect(values).toHaveLength(24);
        expect(values.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
        expect(runsPerHour()).toEqual(values);
    });

    it("is busiest in the afternoon and quietest before dawn", () => {
        const values = runsPerHour();
        expect(values[16]).toBeGreaterThan(values[4] + 40);
    });
});

describe("blockRatePerDay", () => {
    it("gives 30 percentages with two decimals at most", () => {
        const values = blockRatePerDay();
        expect(values).toHaveLength(30);
        expect(values.every((value) => Math.round(value * 100) / 100 === value)).toBe(true);
    });

    it("peaks on day 22, above the 2% limit", () => {
        const values = blockRatePerDay();
        expect(Math.max(...values)).toBe(values[21]);
        expect(values[21]).toBeGreaterThan(2);
    });

    it("starts 29 days before now", () => {
        expect(BLOCK_RATE_START).toBe(NOW - 29 * DAY);
    });
});
