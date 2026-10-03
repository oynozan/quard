// @vitest-environment node
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
});

describe("KEPT_FOR", () => {
    it("keeps runs tied to an incident a year and approval arguments until decided", () => {
        expect(KEPT_FOR.map(({ item, keep, days }) => [item, keep, days])).toEqual([
            ["Runs tied to an incident", "1 year", 365],
            ["Memory labels", "Kept", null],
            ["Fleet first-seen index", "1 year", 365],
            ["Approval arguments", "Until decided", null],
        ]);
    });
});
