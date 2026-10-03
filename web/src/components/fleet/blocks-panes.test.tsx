import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlocksByGuard } from "@/lib/data/fleet";
import { blockSeries } from "@/lib/data/fleet/series";
import { formatInt } from "@/lib/format";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { BlocksPanes } from "./blocks-panes";
import { dailySummary, heatSummary, HOUR_CAPTIONS, peakIndex, sum } from "./lib/charts";

const { byGuard, heatmap } = blockSeries();
const last = (values: number[]) => formatInt(values[values.length - 1]);

function pane(name: string) {
    return screen.getByRole("region", { name });
}

function chartLabel(name: string) {
    return within(pane(name)).getByRole("img").getAttribute("aria-label");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("BlocksPanes", () => {
    it("shows every guard's blocks per day and today's total by default", () => {
        render(<BlocksPanes byGuard={byGuard} heatmap={heatmap} />);
        expect(screen.getByRole("heading", { name: "What guards block" })).toBeTruthy();
        expect(pane("Blocks per day").textContent).toContain(`Today${last(byGuard.totals)}`);
        expect(chartLabel("Blocks per day")).toBe(dailySummary("Blocks", byGuard.totals, byGuard.startAt));
    });

    it("offers one filter per guard type, each with its total", () => {
        render(<BlocksPanes byGuard={byGuard} heatmap={heatmap} />);
        const filter = screen.getByRole("group", { name: "Guard type" });
        const labels = within(filter)
            .getAllByRole("button")
            .map((button) => button.textContent);
        const source = byGuard.series.find((row) => row.guard === "source");
        expect(labels[0]).toBe(`All guards${sum(byGuard.totals)}`);
        expect(labels).toContain(`Source${source?.total}`);
        expect(labels).toHaveLength(byGuard.series.length + 1);
    });

    it("switches the daily chart to the picked guard", () => {
        render(<BlocksPanes byGuard={byGuard} heatmap={heatmap} />);
        const egress = byGuard.series.find((row) => row.guard === "egress");
        if (!egress) throw new Error("no egress series");
        fireEvent.click(screen.getByRole("button", { name: `Egress${egress.total}` }));
        expect(pane("Egress blocks per day").textContent).toContain(`Today${last(egress.values)}`);
        expect(chartLabel("Egress blocks per day")).toBe(dailySummary("Egress blocks", egress.values, byGuard.startAt));
    });

    it("names the busiest UTC hour on the heatmap", () => {
        render(<BlocksPanes byGuard={byGuard} heatmap={heatmap} />);
        const name = "Blocks by hour, all guards";
        expect(pane(name).textContent).toContain(`Busiest hour${HOUR_CAPTIONS[peakIndex(heatmap.hourTotals)]}`);
        expect(chartLabel(name)).toBe(heatSummary(heatmap));
    });

    it("shows a dash for today and the empty text when the series has no days yet", () => {
        const empty: BlocksByGuard = { startAt: byGuard.startAt, series: [], totals: [] };
        render(<BlocksPanes byGuard={empty} heatmap={heatmap} />);
        expect(pane("Blocks per day").textContent).toContain("Today—");
        expect(chartLabel("Blocks per day")).toBe("No blocks in the last 30 days");
        expect(screen.getByRole("button", { name: "All guards0" })).toBeTruthy();
    });

    it("shows loading charts and no filter while the data loads", () => {
        render(<BlocksPanes byGuard={null} heatmap={null} />);
        expect(screen.queryByRole("group", { name: "Guard type" })).toBeNull();
        expect(chartLabel("Blocks per day")).toBe("Blocks per day, loading");
        expect(chartLabel("Blocks by hour, all guards")).toBe("Blocks by hour, all guards, loading");
        expect(pane("Blocks per day").getAttribute("aria-busy")).toBe("true");
    });

    it("describes the heatmap as loading in its table view until it arrives", () => {
        render(<BlocksPanes byGuard={byGuard} heatmap={null} />);
        const name = "Blocks by hour, all guards";
        fireEvent.click(within(pane(name)).getByRole("button", { name: "Table" }));
        expect(pane(name).querySelector("caption")?.textContent).toBe("Blocks by weekday and hour are loading.");
    });
});
