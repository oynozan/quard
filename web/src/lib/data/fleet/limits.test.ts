import { describe, expect, it } from "vitest";
import { runLimitsOf } from "./limits";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 3, hour));

describe("runLimitsOf", () => {
    it("is empty while no run went over a run limit", () => {
        expect(runLimitsOf([])).toEqual([]);
    });

    it("lists all five limits in order, giving the ones no run went over the newest mode", () => {
        const limits = runLimitsOf([
            { rule: "max-cost", mode: "block", wouldStop: 0, stopped: 2, lastAt: at(9) },
            { rule: "max-depth", mode: "observe", wouldStop: 4, stopped: 1, lastAt: at(11) },
            { rule: "max-loops", mode: "block", wouldStop: 1, stopped: 0, lastAt: at(10) },
        ]);

        expect(limits).toEqual([
            { name: "depth", rule: "max-depth", mode: "observe", wouldStop: 4, stopped: 1 },
            { name: "fan-out", rule: "max-fan-out", mode: "observe", wouldStop: 0, stopped: 0 },
            { name: "loops", rule: "max-loops", mode: "block", wouldStop: 1, stopped: 0 },
            { name: "steps", rule: "max-steps", mode: "observe", wouldStop: 0, stopped: 0 },
            { name: "cost", rule: "max-cost", mode: "block", wouldStop: 0, stopped: 2 },
        ]);
    });
});
