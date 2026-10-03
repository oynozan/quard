// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runLimit, RUN_LIMITS, type LimitName } from "./limits";

describe("runLimit", () => {
    it("finds a limit by name", () => {
        expect(runLimit("loops")).toEqual({
            name: "loops",
            rule: "run-limits.loops",
            limit: 5,
            unit: "handoffs back and forth",
            mode: "block",
            hash: "d17a4c2e8b90",
        });
        expect(runLimit("cost").limit).toBe(5);
    });

    it("falls back to the first limit for an unknown name", () => {
        expect(runLimit("width" as LimitName)).toBe(RUN_LIMITS[0]);
    });
});
