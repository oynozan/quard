import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveText, runFrame, stubChartEnv, sweepFills, unstubChartEnv } from "../../../test/charts-cells/env";
import { CellHistogram } from "./cell-histogram";

// 23 runs in five half-second bins
const BINS = [2, 6, 10, 4, 1];

type Props = Partial<ComponentProps<typeof CellHistogram>>;

function renderHistogram(props: Props = {}) {
    return render(
        <CellHistogram
            title="Run time"
            bins={BINS}
            binStart={0}
            binSize={500}
            edges="ms"
            unit="runs"
            unitOne="run"
            summary="Most runs take 1 to 1.5 seconds"
            {...props}
        />,
    );
}

const chart = () => screen.getByRole("img");
const axis = () => document.querySelector(".mt-2") as HTMLElement;
const tooltip = () => document.querySelector('[role="presentation"]') as HTMLElement | null;
const markerLabels = () => [...document.querySelectorAll<HTMLElement>("span[aria-hidden].text-ink")];
const yLabels = () => [...document.querySelector(".w-\\[34px\\]")!.children].map((span) => span.textContent);
const dashes = () => document.querySelectorAll('path[fill="var(--ink-muted)"]');
// At the default width each bin is 14 cells of 7px
const BIN = 98;

beforeEach(stubChartEnv);
afterEach(unstubChartEnv);

describe("CellHistogram", () => {
    it("labels every bin edge when there is room", () => {
        renderHistogram();
        expect(chart().getAttribute("aria-label")).toBe("Most runs take 1 to 1.5 seconds");
        expect(chart().getAttribute("tabindex")).toBe("0");
        const labels = [...axis().children].map((span) => span.textContent);
        expect(labels).toEqual(["0 s", "0.5 s", "1 s", "1.5 s", "2 s", "2.5 s"]);
        // A peak of 10 rounds the scale up to 12 in steps of 4
        expect(yLabels()).toEqual(["4", "8", "12", "0"]);
        expect(document.querySelector('path[fill="var(--signal)"]')!.getAttribute("d")).toBeTruthy();
        expect(liveText(document)).toBe("");
    });

    it("reads out the bin under the pointer with its share", () => {
        renderHistogram();
        fireEvent.pointerMove(chart(), { clientX: 2 * BIN + 10 });
        expect(liveText(document)).toBe("10 runs, 1.00–1.50 s, 43.5%");
        expect(tooltip()!.textContent).toBe("10runs1.00–1.50 s · 43.5%");
        expect(tooltip()!.style.left).toBe(`${40 + 3 * BIN + 8}px`);
        // The tallest bin would push it above the field, so it stops at the top
        expect(tooltip()!.style.top).toBe("0px");
        expect(document.querySelector('path[fill="var(--mint)"]')).toBeTruthy();
        fireEvent.pointerLeave(chart());
        expect(tooltip()).toBeNull();
    });

    it("flips the tooltip for bins in the right half and uses the singular unit", () => {
        renderHistogram();
        fireEvent.pointerMove(chart(), { clientX: 4 * BIN + 10 });
        expect(liveText(document)).toBe("1 run, 2.00–2.50 s, 4.3%");
        expect(tooltip()!.style.right).toBe(`calc(100% - ${40 + 4 * BIN - 10}px)`);
        // 52px above the top of a 10.5px column in a 145px field
        expect(tooltip()!.style.top).toBe("82.5px");
    });

    it("keeps a pointer past the last bin on the last bin", () => {
        renderHistogram();
        fireEvent.pointerMove(chart(), { clientX: 9 * BIN });
        expect(liveText(document)).toBe("1 run, 2.00–2.50 s, 4.3%");
    });

    it("starts the keyboard at the highest bin and clears on blur", () => {
        renderHistogram();
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(liveText(document)).toBe("1 run, 2.00–2.50 s, 4.3%");
        fireEvent.keyDown(chart(), { key: "Home" });
        expect(liveText(document)).toBe("2 runs, 0.00–0.50 s, 8.7%");
        fireEvent.blur(chart());
        expect(liveText(document)).toBe("");
    });

    it("marks percentiles with a dashed line and a label on the free side", () => {
        renderHistogram({
            percentiles: [
                { label: "p50", value: 1100 },
                { label: "p99", value: 2450 },
            ],
        });
        expect(dashes()).toHaveLength(2);
        const [p50, p99] = markerLabels();
        expect(p50.textContent).toBe("p50 1.1 s");
        expect(p50.firstElementChild!.textContent).toBe("p50");
        expect(p50.style.textAlign).toBe("left");
        // Column 30 of 7px cells, just after the axis
        expect([p50.style.left, p50.style.paddingLeft]).toEqual(["250px", "3px"]);
        // The p99 label has no room after its line, so it sits before it
        expect(p99.textContent).toBe("p99 2.5 s");
        expect(p99.style.textAlign).toBe("right");
        expect(p99.style.paddingRight).toBe("3px");
    });

    it("drops a percentile label that has no room but keeps its line", () => {
        renderHistogram({
            percentiles: [
                { label: "p10", value: 0 },
                { label: "p25", value: 100 },
            ],
        });
        expect(dashes()).toHaveLength(2);
        expect(markerLabels().map((label) => label.textContent)).toEqual(["p10 0.0 s"]);
    });

    it("thins the edge labels for many narrow bins and keeps the ends inside", () => {
        const bins = Array.from({ length: 60 }, (_, i) => i % 7);
        renderHistogram({ bins, binSize: 10, edges: undefined });
        const labels = [...axis().children] as HTMLElement[];
        expect(labels).toHaveLength(16);
        expect(labels.slice(0, 3).map((span) => span.textContent)).toEqual(["0", "40", "80"]);
        expect(labels[0].style.left).toBe("40px");
        expect(labels[15].textContent).toBe("600");
        // The field is 478px wide and the label 15px
        expect(labels[15].style.left).toBe(`${40 + 478 - 15}px`);
    });

    it("lists each bin's range, count and share in the table view", () => {
        renderHistogram({ edges: "usd", binSize: 0.5, readouts: [{ label: "Median", value: "$1.10" }] });
        expect(screen.getByText("Median")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table");
        expect(within(table).getByText("Most runs take 1 to 1.5 seconds")).toBeTruthy();
        const heads = within(table)
            .getAllByRole("columnheader")
            .map((th) => th.textContent);
        expect(heads).toEqual(["Range", "Runs", "Share"]);
        const rows = within(table).getAllByRole("row");
        expect([...rows[1].children].map((cell) => cell.textContent)).toEqual(["$0.00–$0.50", "2", "8.7%"]);
        expect(rows).toHaveLength(6);
    });

    it("keeps the table as tall as the chart, plus the readout row", () => {
        const tableHeight = () => (screen.getByRole("table").parentElement as HTMLElement).style.height;
        const { unmount } = renderHistogram();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        // A 145px field plus the 18px axis
        expect(tableHeight()).toBe("163px");
        unmount();
        renderHistogram({ readouts: [{ label: "Median", value: "1.1 s" }] });
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(tableHeight()).toBe("193px");
    });

    it("says there is no data when there are no bins", () => {
        renderHistogram({ bins: [], percentiles: [{ label: "p50", value: 1100 }] });
        expect(chart().getAttribute("aria-label")).toBe("No data in this range");
        expect(chart().getAttribute("tabindex")).toBe("-1");
        expect(screen.getByText("No data in this range")).toBeTruthy();
        expect(dashes()).toHaveLength(0);
        expect(yLabels()).toEqual(["—", "—", "—", "—"]);
        // An unlit field of 20 bins keeps its edge labels
        expect(axis().children[0].textContent).toBe("0 s");
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No data in this range")).toBeTruthy();
    });

    it("sweeps an unlit field while loading", () => {
        const { container } = renderHistogram({ state: "loading", percentiles: [{ label: "p50", value: 1100 }] });
        expect(chart().getAttribute("aria-label")).toBe("Run time, loading");
        expect(dashes()).toHaveLength(0);
        expect(axis().children).toHaveLength(6);
        runFrame(700);
        expect(sweepFills(container).length).toBeGreaterThan(0);
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("Loading…")).toBeTruthy();
    });

    it("draws twenty unlit bins while loading with no bins yet", () => {
        renderHistogram({ bins: [], state: "loading", emptyText: "Nothing yet" });
        expect(axis().children[0].textContent).toBe("0 s");
        expect(screen.queryByText("Nothing yet")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("Loading…")).toBeTruthy();
    });

    it("keeps the bins readable while refetching", () => {
        renderHistogram({ state: "refetching", tag: "24h", className: "wide" });
        expect(screen.getByRole("region", { name: "Run time" }).className).toContain("wide");
        expect(screen.getByText("24h")).toBeTruthy();
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("2 runs, 0.00–0.50 s, 8.7%");
    });
});
