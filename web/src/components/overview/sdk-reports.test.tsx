import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SdkReports as Reports } from "@/lib/data/sdk-reports";
import { HOUR, MINUTE, NOW } from "../../../test/time";
import { SdkReports } from "./sdk-reports";

// Each warning rule as headline and note
function rules(reports: Reports): string[] {
    render(<SdkReports reports={reports} now={NOW} />);
    const region = screen.getByRole("region", { name: "SDK problems" });
    return [...region.children].map((rule) => [...rule.querySelectorAll("p")].map((p) => p.textContent).join(" | "));
}

describe("SdkReports", () => {
    it("is hidden when no config failed to load and no events were lost", () => {
        const { container } = render(<SdkReports reports={{ configErrors: [], dropped: null }} now={NOW} />);
        expect(container.innerHTML).toBe("");
    });

    it("lists config that failed to load, saying the last good one stays in use", () => {
        const policy = { source: "policy" as const, message: "Unexpected token", lastSeenAt: NOW - 2 * HOUR, count: 3 };
        const feed = { source: "signatures" as const, message: "HTTP 503", lastSeenAt: NOW - 5 * MINUTE, count: 1 };
        expect(rules({ configErrors: [policy, feed], dropped: null })).toEqual([
            "The policy file failed to load, so the last good one stays in use. | Unexpected token · 3 times, last 2 h ago",
            "The signature feed failed to load, so the last good one stays in use. | HTTP 503 · 1 time, last 5 min ago",
        ]);
    });

    it("says how many events were lost while the backend could not be reached", () => {
        expect(rules({ configErrors: [], dropped: { count: 1240, lastAt: NOW - 3 * MINUTE } })).toEqual([
            "1,240 events were lost in the last 24 hours while the backend could not be reached. | Last lost 3 min ago. Runs from that time can miss steps.",
        ]);
    });

    it("says one event was lost in the singular", () => {
        expect(rules({ configErrors: [], dropped: { count: 1, lastAt: NOW - HOUR } })[0]).toMatch(/^1 event was lost/);
    });
});
