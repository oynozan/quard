// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HOUR, MINUTE, NOW } from "../rng";
import { BACKEND_OUTAGE, inOutage } from "./outage";

describe("inOutage", () => {
    it("lasts 12 minutes, ending 3 hours and 6 minutes before now", () => {
        expect(BACKEND_OUTAGE.to - BACKEND_OUTAGE.from).toBe(12 * MINUTE);
        expect(BACKEND_OUTAGE.to).toBe(NOW - 3 * HOUR - 6 * MINUTE);
    });

    it("includes the start and leaves out the end", () => {
        expect(inOutage(BACKEND_OUTAGE.from - 1)).toBe(false);
        expect(inOutage(BACKEND_OUTAGE.from)).toBe(true);
        expect(inOutage(BACKEND_OUTAGE.to - 1)).toBe(true);
        expect(inOutage(BACKEND_OUTAGE.to)).toBe(false);
    });
});
