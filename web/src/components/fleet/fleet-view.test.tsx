import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_WIDE } from "@/components/kit/page";
import { formatShortDate } from "@/lib/format";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { quarantineData } from "../../../test/fleet-shell/quarantine";
import { BY_GUARD, HEATMAP, LINKS, emptyFleet, fullFleet } from "../../../test/summary/fleet";
import { FleetContainer, FleetView } from "./fleet-view";

const NOTHING = quarantineData({ quarantine: [], watching: [] });

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/data/fleet/actions", () => ({ markKnown: vi.fn() }));

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
        const quarantine = quarantineData();
        render(<FleetView fleet={fleet} quarantine={quarantine} />);

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText(`${formatShortDate(fleet.startAt)} – ${formatShortDate(fleet.endAt)}`)).toBeTruthy();
        expect(sectionNames()).toEqual(SECTIONS);
        expect(screen.getByRole("heading", { name: `Quarantine${quarantine.quarantine.length}` })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
    });

    it("keeps every section on a brand-new project, the quarantine with its empty tables", () => {
        render(<FleetView fleet={emptyFleet()} quarantine={NOTHING} />);

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        expect(screen.getByText("Last 30 days")).toBeTruthy();
        expect(sectionNames()).toEqual(SECTIONS);
        const quarantine = within(section("Quarantine"));
        expect(quarantine.getByRole("heading", { level: 2 }).textContent).toBe("Quarantine0");
        expect(quarantine.getByRole("heading", { name: "Nothing in quarantine" })).toBeTruthy();
        expect(quarantine.getByText("No new values are being counted")).toBeTruthy();
    });

    it("gives each empty section one line when another section has data", () => {
        render(
            <FleetView fleet={emptyFleet({ blocksByGuard: BY_GUARD, blocksHeatmap: HEATMAP })} quarantine={NOTHING} />,
        );
        const lines = screen
            .getAllByRole("status")
            .map((line) => line.textContent)
            .filter(Boolean);

        expect(sectionNames()).toEqual(SECTIONS);
        expect(lines).toEqual([
            "No incidents in the last 30 days",
            "No untrusted links in the last 30 days",
            "No runs over a limit in the last 30 days",
            "No new values are being counted",
        ]);
        expect(within(section("What guards block")).getAllByRole("img")).toHaveLength(2);
        for (const name of ["Where incidents start", "Agents and links", "Run limits"]) {
            expectNoChartsOrTables(section(name));
        }
    });

    it("shows the untrusted links on their own when nothing was blocked", () => {
        render(<FleetView fleet={emptyFleet({ untrustedLinks: LINKS })} quarantine={NOTHING} />);

        expect(within(section("What guards block")).getByRole("status").textContent).toBe(
            "No blocks in the last 30 days",
        );
        expect(within(section("Untrusted links")).getAllByRole("row")).toHaveLength(3);
    });

    it("shows every section loading while the summary is on its way", () => {
        render(<FleetView fleet={null} quarantine={null} />);

        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
        expect(screen.queryByText(/ – /)).toBeNull();
        expect(sectionNames()).toEqual(SECTIONS);
        for (const name of ["Where incidents start", "Run limits"]) {
            expect(section(name).getAttribute("aria-busy")).toBe("true");
            expect(within(section(name)).queryByRole("img")).toBeNull();
            expect(within(section(name)).queryByRole("table")).toBeNull();
        }
        // The quarantine has a source, so its table keeps a skeleton
        expect(section("Quarantine").getAttribute("aria-busy")).toBe("true");
        expect(within(section("Quarantine")).getByRole("table")).toBeTruthy();
        // Nothing is called empty while it loads
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "Loading links…",
            "Loading quarantine…",
        ]);
        expect(screen.queryByRole("heading", { name: "Watching" })).toBeNull();
    });
});
