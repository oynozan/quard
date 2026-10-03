// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE, NOW } from "../../../../../test/time";
import { hoursWindow, rosterWindow, WINDOW_DAYS } from "./windows";

describe("rosterWindow", () => {
    it("looks back 30 days for agents, a day for runs and two quiet minutes for running", () => {
        expect(WINDOW_DAYS).toBe(30);
        expect(rosterWindow(NOW)).toEqual({
            since: new Date(NOW - 30 * DAY),
            dayAgo: new Date(NOW - DAY),
            idleSince: new Date(NOW - 2 * MINUTE),
        });
    });
});

describe("hoursWindow", () => {
    it("covers 24 whole hours, ending when the current hour ends", () => {
        // NOW is 18:40, so the window runs from 19:00 the day before to 19:00 today
        expect(hoursWindow(NOW)).toEqual({
            since: new Date(Date.UTC(2026, 9, 2, 19)),
            until: new Date(Date.UTC(2026, 9, 3, 19)),
        });
    });

    it("keeps a time on the hour inside the window", () => {
        const hour = Date.UTC(2026, 9, 3, 18);
        expect(hoursWindow(hour).until.getTime()).toBe(hour + HOUR);
        expect(hoursWindow(hour - 1).until.getTime()).toBe(hour);
    });
});
