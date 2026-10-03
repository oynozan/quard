// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE } from "@/lib/time";
import {
    formatAge,
    formatClock,
    formatCompact,
    formatCost,
    formatDuration,
    formatInt,
    formatLongDate,
    formatOutcome,
    formatPercent,
    formatPValue,
    formatShare,
    formatShortDate,
    formatStepDuration,
    formatUsd,
    padCount,
    shortHash,
    shortId,
} from "./format";

// 3 October 2026, 13:05:07 UTC
const TIME = Date.UTC(2026, 9, 3, 13, 5, 7);

describe("number formats", () => {
    it("groups whole numbers with commas", () => {
        expect(formatInt(1234567)).toBe("1,234,567");
    });

    it("shortens big numbers to one decimal", () => {
        expect(formatCompact(1234)).toBe("1.2K");
        expect(formatCompact(2_500_000)).toBe("2.5M");
        expect(formatCompact(42)).toBe("42");
    });

    it("writes dollars with cents", () => {
        expect(formatUsd(1234.5)).toBe("$1,234.50");
    });

    it("writes a percent with two digits unless told otherwise", () => {
        expect(formatPercent(12.345)).toBe("12.35%");
        expect(formatPercent(12.345, 0)).toBe("12%");
    });

    it("writes a share from 0 to 1 as a whole percent", () => {
        expect(formatShare(0.424)).toBe("42%");
        expect(formatShare(1)).toBe("100%");
    });

    it("pads counts to two digits", () => {
        expect(padCount(7)).toBe("07");
        expect(padCount(123)).toBe("123");
    });
});

describe("dates and times", () => {
    it("prints the UTC clock, with seconds when asked", () => {
        expect(formatClock(TIME)).toBe("13:05");
        expect(formatClock(TIME, true)).toBe("13:05:07");
    });

    it("prints a short and a long date in UTC", () => {
        expect(formatShortDate(TIME)).toBe("3 Oct");
        expect(formatLongDate(TIME)).toBe("3 October 2026 at 13:05");
    });
});

describe("formatAge", () => {
    it("counts minutes under an hour, and never says zero", () => {
        expect(formatAge(TIME - 4 * MINUTE, TIME)).toBe("4 min");
        expect(formatAge(TIME - 10_000, TIME)).toBe("1 min");
    });

    it("treats a time in the future as just now", () => {
        expect(formatAge(TIME + HOUR, TIME)).toBe("1 min");
    });

    it("counts hours under a day", () => {
        expect(formatAge(TIME - 3 * HOUR, TIME)).toBe("3 h");
    });

    it("counts days after that", () => {
        expect(formatAge(TIME - 2 * DAY, TIME)).toBe("2 d");
    });
});

describe("formatDuration", () => {
    it("uses seconds under a minute", () => {
        expect(formatDuration(45_000)).toBe("45 s");
    });

    it("uses minutes and seconds under an hour", () => {
        expect(formatDuration(125_000)).toBe("2 min 5 s");
    });

    it("uses hours and minutes after that", () => {
        expect(formatDuration(3 * HOUR + 7 * MINUTE + 20_000)).toBe("3 h 7 min");
    });
});

describe("formatStepDuration", () => {
    it("uses whole milliseconds under a second, never below zero", () => {
        expect(formatStepDuration(18.4)).toBe("18 ms");
        expect(formatStepDuration(-5)).toBe("0 ms");
    });

    it("uses tenths of a second under ten seconds", () => {
        expect(formatStepDuration(1400)).toBe("1.4 s");
    });

    it("falls back to the run duration format for longer steps", () => {
        expect(formatStepDuration(75_000)).toBe("1 min 15 s");
    });
});

describe("formatCost", () => {
    it("shows four decimals for costs under a cent", () => {
        expect(formatCost(0.0042)).toBe("$0.0042");
    });

    it("shows plain dollars for zero and for larger costs", () => {
        expect(formatCost(0)).toBe("$0.00");
        expect(formatCost(1.5)).toBe("$1.50");
    });
});

describe("formatPValue", () => {
    it("caps very small values", () => {
        expect(formatPValue(0.0004)).toBe("p < 0.001");
    });

    it("shows three decimals otherwise", () => {
        expect(formatPValue(0.004)).toBe("p = 0.004");
        expect(formatPValue(0.05)).toBe("p = 0.050");
    });
});

describe("formatOutcome", () => {
    it("says what happened in block mode, which is the default", () => {
        expect(formatOutcome("block")).toBe("Blocked");
        expect(formatOutcome("ask", "block")).toBe("Asked");
        expect(formatOutcome("strip")).toBe("Stripped");
        expect(formatOutcome("flag")).toBe("Flagged");
        expect(formatOutcome("allow")).toBe("Allowed");
        expect(formatOutcome("pass")).toBe("Passed");
    });

    it("treats an unknown mode like block mode", () => {
        expect(formatOutcome("block", null)).toBe("Blocked");
    });

    it("says what the rule would have done in observe mode", () => {
        expect(formatOutcome("block", "observe")).toBe("Would block");
        expect(formatOutcome("ask", "observe")).toBe("Would ask");
        expect(formatOutcome("strip", "observe")).toBe("Would strip");
        expect(formatOutcome("flag", "observe")).toBe("Would flag");
        expect(formatOutcome("allow", "observe")).toBe("Allowed");
        expect(formatOutcome("pass", "observe")).toBe("Passed");
    });
});

describe("short ids", () => {
    it("keeps the first 8 characters of an id", () => {
        expect(shortId("3f9a2c71de884b10")).toBe("3f9a2c71");
    });

    it("keeps the first 12 characters of a hash", () => {
        expect(shortHash("a1b2c3d4e5f6a7b8c9d0")).toBe("a1b2c3d4e5f6");
    });
});
