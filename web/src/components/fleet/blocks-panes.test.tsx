import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlocksByGuard } from "@/lib/data/fleet";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { BY_GUARD, HEATMAP, emptyFleet } from "../../../test/summary/fleet";
import { BlocksPanes } from "./blocks-panes";

const HEAT = "Blocks by hour, all guards";

function pane(name: string) {
    return screen.getByRole("region", { name });
}

function chartLabel(name: string) {
    return within(pane(name)).getByRole("img").getAttribute("aria-label");
}

function filterLabels(): (string | null)[] {
    return within(screen.getByRole("group", { name: "Guard type" }))
        .getAllByRole("button")
        .map((button) => button.textContent);
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("BlocksPanes", () => {
    it("shows every guard's blocks per day and today's total by default", () => {
        render(<BlocksPanes byGuard={BY_GUARD} heatmap={HEATMAP} />);

        expect(screen.getByRole("heading", { level: 2, name: "What guards block" })).toBeTruthy();
        expect(pane("Blocks per day").textContent).toContain("Today5");
        expect(chartLabel("Blocks per day")).toBe(
            "Blocks per day over the last 30 days. Peak 1,200 on 2 Oct, 5 today.",
        );
    });

    it("offers only the guards that blocked something, each with its total", () => {
        render(<BlocksPanes byGuard={BY_GUARD} heatmap={HEATMAP} />);

        expect(filterLabels()).toEqual(["All guards1210", "Source6", "Egress1204"]);
        expect(screen.getByRole("button", { name: "All guards1210" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("switches the daily chart to the picked guard", () => {
        render(<BlocksPanes byGuard={BY_GUARD} heatmap={HEATMAP} />);
        fireEvent.click(screen.getByRole("button", { name: "Egress1204" }));

        expect(pane("Egress blocks per day").textContent).toContain("Today3");
        expect(chartLabel("Egress blocks per day")).toBe(
            "Egress blocks per day over the last 30 days. Peak 1,200 on 2 Oct, 3 today.",
        );
    });

    it("goes back to all guards when the picked guard no longer has blocks", () => {
        const { rerender } = render(<BlocksPanes byGuard={BY_GUARD} heatmap={HEATMAP} />);
        fireEvent.click(screen.getByRole("button", { name: "Source6" }));
        const [source, ...rest] = BY_GUARD.series;
        const quiet: BlocksByGuard = {
            ...BY_GUARD,
            series: [{ ...source, values: [0, 0, 0], total: 0 }, ...rest],
            totals: [1, 1200, 3],
        };

        rerender(<BlocksPanes byGuard={quiet} heatmap={HEATMAP} />);

        expect(filterLabels()).toEqual(["All guards1204", "Egress1204"]);
        expect(screen.getByRole("button", { name: "All guards1204" }).getAttribute("aria-pressed")).toBe("true");
        expect(pane("Blocks per day").textContent).toContain("Today3");
    });

    it("names the busiest UTC hour on the heatmap", () => {
        render(<BlocksPanes byGuard={BY_GUARD} heatmap={HEATMAP} />);

        expect(pane(HEAT).textContent).toContain("Busiest hour14:00–15:00");
        expect(chartLabel(HEAT)).toBe(
            "Blocks by weekday and UTC hour over the last 30 days, 1,210 in total. Busiest hour 14:00–15:00.",
        );
    });

    it("shows one line and no filter or charts when nothing was blocked", () => {
        const { blocksByGuard, blocksHeatmap } = emptyFleet();
        render(<BlocksPanes byGuard={blocksByGuard} heatmap={blocksHeatmap} />);
        const section = pane("What guards block");

        expect(within(section).getByRole("status").textContent).toBe("No blocks in the last 30 days");
        expect(screen.queryByRole("group", { name: "Guard type" })).toBeNull();
        expectNoChartsOrTables(section);
    });

    it("shows loading charts and no filter while the data loads", () => {
        render(<BlocksPanes byGuard={null} heatmap={null} />);

        expect(screen.queryByRole("group", { name: "Guard type" })).toBeNull();
        expect(chartLabel("Blocks per day")).toBe("Blocks per day, loading");
        expect(chartLabel(HEAT)).toBe("Blocks by hour, all guards, loading");
        expect(pane("Blocks per day").getAttribute("aria-busy")).toBe("true");
    });

    it("waits for the heatmap too, and says both charts are loading in their table views", () => {
        render(<BlocksPanes byGuard={BY_GUARD} heatmap={null} />);
        for (const name of ["Blocks per day", HEAT]) {
            fireEvent.click(within(pane(name)).getByRole("button", { name: "Table" }));
        }

        expect(pane("Blocks per day").querySelector("caption")?.textContent).toBe("Blocks per day are loading.");
        expect(pane(HEAT).querySelector("caption")?.textContent).toBe("Blocks by weekday and hour are loading.");
    });
});
