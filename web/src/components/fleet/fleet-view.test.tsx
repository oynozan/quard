import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_WIDE } from "@/components/kit/page";
import { formatShortDate } from "@/lib/format";
import { sampleFleet, stubBrowser } from "../../../test/fleet-shell/env";
import { FleetContainer, FleetView } from "./fleet-view";

const SECTIONS = ["Where incidents start", "What guards block", "Agents and links", "Run limits", "Quarantine"];

function sectionNames(): string[] {
    return screen
        .getAllByRole("region")
        .map((region) => region.getAttribute("aria-label") ?? "")
        .filter((name) => SECTIONS.includes(name));
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("FleetContainer", () => {
    it("wraps the page in the shared wide gutter", () => {
        render(
            <FleetContainer>
                <p>Inside</p>
            </FleetContainer>,
        );
        expect(screen.getByText("Inside").parentElement?.className).toBe(PAGE_WIDE);
    });
});

describe("FleetView", () => {
    it("shows the 30-day window and every section in order", async () => {
        const fleet = await sampleFleet();
        render(<FleetView fleet={fleet} />);
        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText(`${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`)).toBeTruthy();
        expect(sectionNames()).toEqual(SECTIONS);
        expect(screen.getByRole("heading", { name: `Quarantine${fleet.quarantine.length}` })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
    });

    it("shows every section loading while the fleet data is on its way", () => {
        render(<FleetView fleet={null} />);
        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
        expect(screen.queryByText(/ – /)).toBeNull();
        expect(sectionNames()).toEqual(SECTIONS);
        expect(screen.getByText("Loading quarantine…")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Watching" })).toBeNull();
    });
});
