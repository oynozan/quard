// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MINUTE, NOW, SECOND } from "../../../../test/time";
import { HERO_BUCKETS, RATE_DAYS, RUN_HOURS, windowsAt } from "./windows";

const iso = (date: Date) => date.toISOString();

describe("windowsAt", () => {
    it("ends the hero at the round 10 minutes after now, 144 buckets back", () => {
        // 18:40 sharp starts a new slot, so the window runs to 18:50
        const { activity } = windowsAt(NOW);

        expect(iso(activity.since)).toBe("2026-10-02T18:50:00.000Z");
        expect(iso(activity.until)).toBe("2026-10-03T18:50:00.000Z");
        expect(activity.bucketMs).toBe(10 * MINUTE);
        expect(HERO_BUCKETS * activity.bucketMs).toBe(activity.until.getTime() - activity.since.getTime());
    });

    it("ends the runs sparkline at the next hour, 24 hours back", () => {
        const { runs } = windowsAt(NOW);

        expect(iso(runs.since)).toBe("2026-10-02T19:00:00.000Z");
        expect(iso(runs.until)).toBe("2026-10-03T19:00:00.000Z");
        expect(RUN_HOURS * runs.bucketMs).toBe(runs.until.getTime() - runs.since.getTime());
    });

    it("keeps the slot that holds a time between round minutes", () => {
        const { activity, runs } = windowsAt(NOW + 9 * MINUTE + 59 * SECOND);

        expect(iso(activity.until)).toBe("2026-10-03T18:50:00.000Z");
        expect(iso(runs.until)).toBe("2026-10-03T19:00:00.000Z");
    });

    it("reads the last 24 hours up to now", () => {
        const { lastDay } = windowsAt(NOW);

        expect(iso(lastDay.since)).toBe("2026-10-02T18:40:00.000Z");
        expect(iso(lastDay.until)).toBe("2026-10-03T18:40:00.000Z");
    });

    it("starts the block rate at UTC midnight 29 days back, so today is day 30", () => {
        const { rateDays } = windowsAt(NOW);

        expect(RATE_DAYS).toBe(30);
        expect(iso(rateDays.since)).toBe("2026-09-04T00:00:00.000Z");
        expect(iso(rateDays.until)).toBe("2026-10-03T18:40:00.000Z");
    });

    it("lists agents seen in 30 days and counts as running those active in the last 2 minutes", () => {
        const { roster } = windowsAt(NOW);

        expect(iso(roster.since)).toBe("2026-09-03T18:40:00.000Z");
        expect(iso(roster.dayAgo)).toBe("2026-10-02T18:40:00.000Z");
        expect(iso(roster.idleSince)).toBe("2026-10-03T18:38:00.000Z");
    });
});
