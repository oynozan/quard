import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { getFleet } from "@/lib/data/fleet";
import { formatShortDate } from "@/lib/format";
import SummaryPage, { metadata } from "./page";

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

    it("shows the fleet for the last 30 days", async () => {
        const fleet = await getFleet();
        render(await SummaryPage());
        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        const period = `${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`;
        expect(screen.getByText(period)).toBeTruthy();
    });
});
