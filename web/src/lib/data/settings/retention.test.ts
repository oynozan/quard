// @vitest-environment node
import { RETENTION } from "@quard/db";
import { describe, expect, it } from "vitest";
import { KEPT_FOR, retentionRows } from "./retention";

describe("retentionRows", () => {
    it("starts with the project's run window, then the fixed rules", () => {
        const rows = retentionRows(30);
        expect(rows[0]).toEqual({ item: "Runs", keep: "30 days", days: 30 });
        expect(rows.slice(1)).toEqual(KEPT_FOR);
    });

    it("says day, not days, for a one-day window", () => {
        expect(retentionRows(1)[0]).toEqual({ item: "Runs", keep: "1 day", days: 1 });
    });

    it("counts whole years in years", () => {
        expect(retentionRows(365)[0].keep).toBe("1 year");
        expect(retentionRows(730)[0].keep).toBe("2 years");
    });
});

describe("KEPT_FOR", () => {
    it("shows the windows the worker's cleanup uses", () => {
        expect(KEPT_FOR.map(({ item, keep, days }) => [item, keep, days])).toEqual([
            ["Runs tied to an incident", "1 year", RETENTION.incidentDays],
            ["Memory labels", "Kept", null],
            ["Fleet first-seen index", "1 year", RETENTION.fleetDays],
            ["Approval arguments", "Until decided", null],
        ]);
    });
});
