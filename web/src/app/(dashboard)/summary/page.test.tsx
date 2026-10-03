import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatShortDate } from "@/lib/format";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { emptyFleet, fullFleet } from "../../../../test/summary/fleet";
import SummaryPage, { metadata } from "./page";

// The Postgres read is a boundary, tested in lib/data/fleet/query.test.ts
const getFleet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/fleet", () => ({ getFleet }));

describe("SummaryPage", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Summary");
    });

    it("shows a brand-new project as its heading and one line", async () => {
        getFleet.mockResolvedValueOnce(emptyFleet());
        render(await SummaryPage());

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Nothing to summarize yet");
        expect(screen.queryByText("Last 30 days")).toBeNull();
        expectNoChartsOrTables();
    });

    it("shows the summary for the last 30 days", async () => {
        const fleet = fullFleet();
        getFleet.mockResolvedValueOnce(fleet);
        render(await SummaryPage());

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText(`${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`)).toBeTruthy();
        expect(screen.getByRole("region", { name: "What guards block" })).toBeTruthy();
    });
});
