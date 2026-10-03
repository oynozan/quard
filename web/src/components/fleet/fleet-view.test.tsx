import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_WIDE } from "@/components/kit/page";
import { formatShortDate } from "@/lib/format";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { quarantineData } from "../../../test/fleet-shell/quarantine";
import { expectEmptyChart, expectEmptyTable } from "../../../test/summary/frames";
import { BY_GUARD, HEATMAP, emptyFleet, fullFleet } from "../../../test/summary/fleet";
import { FleetContainer, FleetView } from "./fleet-view";

const NOTHING = quarantineData({ quarantine: [], watching: [] });

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/data/fleet/actions", () => ({ markKnown: vi.fn() }));

const SECTIONS = ["Where incidents start", "What guards block", "Agents and links", "Run limits", "Quarantine"];
const CHARTS = [
    "By entry source",
    "By damaging tool",
    "Blocks per day",
    "Blocks by hour, all guards",
    "Entry points",
    "Turning points",
];
const LINK_HEADERS = ["Link", "Untrusted", "Delegations", "Untrusted share"];

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

    it("keeps every section's panes, tiles and table headers for a brand-new project", () => {
        const fleet = emptyFleet();
        render(<FleetView fleet={fleet} quarantine={NOTHING} />);

        expect(screen.queryByText("Nothing to summarize yet")).toBeNull();
        expectEmptyChart("By entry source", "No incidents in the last 30 days");
        expectEmptyChart("By damaging tool", "No incidents in the last 30 days");
        expectEmptyChart("Blocks per day", "No blocks in the last 30 days");
        expectEmptyChart("Blocks by hour, all guards", "No blocks in the last 30 days");
        expectEmptyChart("Entry points", "No agent was an entry point");
        expectEmptyChart("Turning points", "No agent was a turning point");
        expectEmptyTable(section("Untrusted links"), LINK_HEADERS, "No agent-to-agent link carried untrusted content");
        expect(within(section("Run limits")).getAllByRole("progressbar")).toHaveLength(5);
    });

    it("keeps the empty panes unlit beside a section that has data", () => {
        render(
            <FleetView fleet={emptyFleet({ blocksByGuard: BY_GUARD, blocksHeatmap: HEATMAP })} quarantine={NOTHING} />,
        );

        expect(within(section("Blocks per day")).getByRole("img").getAttribute("aria-label")).toContain(
            "Peak 1,200 on 2 Oct",
        );
        expectEmptyChart("By entry source", "No incidents in the last 30 days");
        expectEmptyChart("Entry points", "No agent was an entry point");
        expectEmptyTable(section("Untrusted links"), LINK_HEADERS, "No agent-to-agent link carried untrusted content");
    });

    it("shows every section loading while the summary is on its way", () => {
        render(<FleetView fleet={null} quarantine={null} />);

        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
        expect(screen.queryByText(/ – /)).toBeNull();
        expect(sectionNames()).toEqual(SECTIONS);
        for (const name of [...CHARTS, "Run limits", "Quarantine"]) {
            expect(section(name).getAttribute("aria-busy"), name).toBe("true");
        }
        // Nothing is called empty while it loads
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "Loading links…",
            "Loading quarantine…",
        ]);
        expect(screen.queryByRole("heading", { name: "Watching" })).toBeNull();
    });
});
