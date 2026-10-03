// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY } from "@/lib/time";
import { barsSummary, chartState, dailySummary, heatSummary, HOUR_CAPTIONS, HOURS, peakIndex, sum } from "./charts";

const OCT_1 = Date.UTC(2026, 9, 1);

describe("hour labels", () => {
    it("pads every hour and wraps the last caption to midnight", () => {
        expect(HOURS).toHaveLength(24);
        expect(HOURS[7]).toBe("07");
        expect(HOUR_CAPTIONS[9]).toBe("09:00–10:00");
        expect(HOUR_CAPTIONS[23]).toBe("23:00–00:00");
    });
});

describe("sum", () => {
    it("adds the values, and gives 0 for none", () => {
        expect(sum([2, 3, 5])).toBe(10);
        expect(sum([])).toBe(0);
    });
});

describe("chartState", () => {
    it("loads until the counts arrive, then is empty when they add up to 0", () => {
        expect(chartState(null)).toBe("loading");
        expect(chartState([])).toBe("empty");
        expect(chartState([0, 0])).toBe("empty");
        expect(chartState([0, 3])).toBe("ready");
    });
});

describe("peakIndex", () => {
    it("finds the largest value and keeps the first on a tie", () => {
        expect(peakIndex([1, 9, 4, 9])).toBe(1);
        expect(peakIndex([0, 0])).toBe(0);
    });
});

describe("dailySummary", () => {
    it("says there were none for a series with no days or only zeros", () => {
        expect(dailySummary("Blocks", [], OCT_1)).toBe("Blocks per day: none in the last 30 days.");
        expect(dailySummary("Blocks", [0, 0, 0], OCT_1)).toBe("Blocks per day: none in the last 30 days.");
    });

    it("names the peak day and today's count", () => {
        expect(dailySummary("Blocks", [1, 1200, 3], OCT_1)).toBe(
            "Blocks per day over the last 30 days. Peak 1,200 on 2 Oct, 3 today.",
        );
        expect(dailySummary("Blocks", [4], OCT_1 + DAY)).toContain("Peak 4 on 2 Oct, 4 today.");
    });
});

describe("heatSummary", () => {
    it("gives the total and the busiest UTC hour", () => {
        const hourTotals = HOURS.map((_, hour) => (hour === 23 ? 40 : 1));
        const summary = heatSummary({ values: [], hourTotals, total: 1234 });
        expect(summary).toBe(
            "Blocks by weekday and UTC hour over the last 30 days, 1,234 in total. Busiest hour 23:00–00:00.",
        );
    });

    it("names no busiest hour when nothing was blocked", () => {
        const summary = heatSummary({ values: [], hourTotals: HOURS.map(() => 0), total: 0 });
        expect(summary).toBe("Blocks by weekday and UTC hour: none in the last 30 days.");
    });
});

describe("barsSummary", () => {
    it("says none for an empty list or one with only zeros", () => {
        expect(barsSummary("Agents", [], "incidents", "incident")).toBe("Agents: none in the last 30 days.");
        expect(barsSummary("Agents", [{ label: "billing", value: 0 }], "incidents", "incident")).toBe(
            "Agents: none in the last 30 days.",
        );
    });

    it("names the leader and how many items there are", () => {
        const items = [
            { label: "billing", value: 1500 },
            { label: "support", value: 2 },
        ];
        expect(barsSummary("Agents", items, "incidents", "incident")).toBe(
            "Agents over the last 30 days. billing leads with 1,500 incidents, out of 2.",
        );
        expect(barsSummary("Agents", [{ label: "billing", value: 1 }], "incidents", "incident")).toBe(
            "Agents over the last 30 days. billing leads with 1 incident, out of 1.",
        );
    });
});
