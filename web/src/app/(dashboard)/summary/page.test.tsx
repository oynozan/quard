import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatShortDate } from "@/lib/format";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { quarantineData } from "../../../../test/fleet-shell/quarantine";
import { emptySpend, fullSpend } from "../../../../test/payments/spend";
import { emptyFleet, fullFleet } from "../../../../test/summary/fleet";
import SummaryPage, { metadata } from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/data/fleet/actions", () => ({ markKnown: vi.fn() }));
// The Postgres reads are a boundary, tested in lib/data/fleet
const data = vi.hoisted(() => ({ getFleet: vi.fn(), getQuarantine: vi.fn() }));
vi.mock("@/lib/data/fleet", () => data);
const payments = vi.hoisted(() => ({ getSpend: vi.fn() }));
vi.mock("@/lib/data/payments/spend", () => payments);

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

    it("keeps every section on a brand-new project", async () => {
        data.getFleet.mockResolvedValueOnce(emptyFleet());
        data.getQuarantine.mockResolvedValueOnce(quarantineData({ quarantine: [], watching: [] }));
        payments.getSpend.mockResolvedValueOnce(emptySpend());
        render(await SummaryPage());

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText("Last 30 days")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "Quarantine0" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Nothing in quarantine" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "x402 spend0" })).toBeTruthy();
    });

    it("shows the summary for the last 30 days, with the quarantine from the database", async () => {
        const fleet = fullFleet();
        data.getFleet.mockResolvedValueOnce(fleet);
        data.getQuarantine.mockResolvedValueOnce(quarantineData());
        payments.getSpend.mockResolvedValueOnce(fullSpend());
        render(await SummaryPage());

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText(`${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`)).toBeTruthy();
        expect(screen.getByRole("region", { name: "What guards block" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "Quarantine3" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "Quarantined payees" })).toBeTruthy();
    });
});
