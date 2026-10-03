import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_WIDE } from "@/components/kit/page";
import { formatShortDate } from "@/lib/format";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { BY_GUARD, HEATMAP, LINKS, emptyFleet, fullFleet } from "../../../test/summary/fleet";
import { FleetContainer, FleetView } from "./fleet-view";

const SECTIONS = ["Where incidents start", "What guards block", "Agents and links", "Run limits", "Quarantine"];

function sectionNames(): string[] {
    return screen
        .getAllByRole("region")
        .map((region) => region.getAttribute("aria-label") ?? "")
        .filter((name) => SECTIONS.includes(name));
}

function section(name: string) {
    return screen.getByRole("region", { name });
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
    it("shows the 30-day window and every section in order", () => {
        const fleet = fullFleet();
        render(<FleetView fleet={fleet} />);

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText(`${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`)).toBeTruthy();
        expect(sectionNames()).toEqual(SECTIONS);
        expect(screen.getByRole("heading", { name: "Quarantine3" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
    });

    it("shows a brand-new project as one line, with no range, charts or tables", () => {
        render(<FleetView fleet={emptyFleet()} />);

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Nothing to summarize yet");
        expect(screen.queryByText("Last 30 days")).toBeNull();
        expect(screen.queryAllByRole("region")).toHaveLength(0);
        expectNoChartsOrTables();
    });

    it("gives each empty section one line when another section has data", () => {
        render(<FleetView fleet={emptyFleet({ blocksByGuard: BY_GUARD, blocksHeatmap: HEATMAP })} />);
        const lines = screen.getAllByRole("status").map((line) => line.textContent);

        expect(sectionNames()).toEqual(SECTIONS);
        expect(lines).toEqual([
            "No incidents in the last 30 days",
            "No untrusted links in the last 30 days",
            "No runs over a limit in the last 30 days",
            "Nothing in quarantine",
        ]);
        expect(within(section("What guards block")).getAllByRole("img")).toHaveLength(2);
        for (const name of ["Where incidents start", "Agents and links", "Run limits", "Quarantine"]) {
            expectNoChartsOrTables(section(name));
        }
    });

    it("shows the untrusted links on their own when nothing was blocked", () => {
        render(<FleetView fleet={emptyFleet({ untrustedLinks: LINKS })} />);

        expect(within(section("What guards block")).getByRole("status").textContent).toBe(
            "No blocks in the last 30 days",
        );
        expect(within(section("Untrusted links")).getAllByRole("row")).toHaveLength(3);
    });

    it("shows every section loading while the summary is on its way", () => {
        render(<FleetView fleet={null} />);

        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
        expect(screen.queryByText(/ – /)).toBeNull();
        expect(sectionNames()).toEqual(SECTIONS);
        for (const name of ["Where incidents start", "Run limits", "Quarantine"]) {
            expect(section(name).getAttribute("aria-busy")).toBe("true");
            expect(within(section(name)).queryByRole("img")).toBeNull();
            expect(within(section(name)).queryByRole("table")).toBeNull();
        }
        // Nothing is called empty while it loads
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual(["Loading links…"]);
        expect(screen.queryByRole("heading", { name: "Watching" })).toBeNull();
    });
});
