import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveText, resizeTo, runFrame, stubChartEnv, sweepFills, unstubChartEnv } from "../../../test/charts-cells/env";
import { CellHeatmap } from "./cell-heatmap";

const VALUES = [
    [0, 3, 20, 70],
    [1, 0, 0, 1200],
];
const COLUMNS = ["00", "01", "02", "03"];

type Props = Partial<ComponentProps<typeof CellHeatmap>>;

function renderHeatmap(props: Props = {}) {
    return render(
        <CellHeatmap
            title="Activity"
            values={VALUES}
            rowLabels={["Mon", "Tue"]}
            columnLabels={COLUMNS}
            unit="runs"
            unitOne="run"
            summary="Busiest on Tuesday at 03"
            {...props}
        />,
    );
}

const chart = () => screen.getByRole("img");
const axis = () => document.querySelector(".mt-2") as HTMLElement;
const rowLabel = (text: string) => [...document.querySelectorAll("span.absolute")].find((s) => s.textContent === text)!;
const tooltip = () => document.querySelector('[role="presentation"]') as HTMLElement | null;
const keyColor = () => (tooltip()!.querySelector("span[aria-hidden]") as HTMLElement).style.background;
const hasFill = (fill: string) => document.querySelector(`path[fill="${fill}"]`) !== null;
// At the default width each cell is 16px with a 2px gap
const PITCH = 18;
const point = (row: number, col: number) => ({ clientX: col * PITCH + 5, clientY: row * PITCH + 5 });

beforeEach(stubChartEnv);
afterEach(unstubChartEnv);

describe("CellHeatmap", () => {
    it("draws the grid with a totals strip and labels a few columns", () => {
        renderHeatmap();
        expect(chart().getAttribute("aria-label")).toBe("Busiest on Tuesday at 03");
        expect(chart().getAttribute("tabindex")).toBe("0");
        expect([...axis().children].map((span) => span.textContent)).toEqual(["00", "03"]);
        expect(hasFill("var(--heat-1)")).toBe(true);
        expect(hasFill("var(--heat-5)")).toBe(true);
        // No value falls in the third step, so it draws no path
        expect(hasFill("var(--heat-3)")).toBe(false);
        expect(hasFill("var(--chart-context)")).toBe(true);
        expect(hasFill("var(--ink)")).toBe(false);
        expect(liveText(document)).toBe("");
    });

    it("shows the heat scale from zero up to the top step", () => {
        renderHeatmap({ steps: [1, 5, 10, 20, 40] });
        const legend = [...document.querySelectorAll("span[aria-hidden]")].find((s) => s.textContent === "040+");
        expect(legend).toBeTruthy();
        expect(legend!.querySelectorAll(".size-\\[10px\\]")).toHaveLength(5);
    });

    it("reads out the cell under the pointer with its heat color", () => {
        renderHeatmap();
        fireEvent.pointerMove(chart(), point(0, 1));
        expect(liveText(document)).toBe("3 runs, Mon 01");
        expect(tooltip()!.textContent).toBe("3runsMon 01");
        expect(tooltip()!.style.left).toBe(`${PITCH + 16 + 10}px`);
        expect(tooltip()!.style.top).toBe("0px");
        expect(keyColor()).toBe("var(--heat-1)");
        expect(hasFill("var(--ink)")).toBe(true);
        expect(rowLabel("Mon").classList.contains("text-ink")).toBe(true);
        expect(rowLabel("Tue").classList.contains("text-ink")).toBe(false);
        // The hovered column gets its own label and hides the mark beside it
        expect(axis().lastElementChild!.textContent).toBe("01");
        expect((axis().children[0] as HTMLElement).style.opacity).toBe("0");
        expect((axis().children[1] as HTMLElement).style.opacity).toBe("1");
    });

    it("flips the tooltip for cells in the right half and marks their column", () => {
        renderHeatmap();
        fireEvent.pointerMove(chart(), point(1, 3));
        expect(liveText(document)).toBe("1,200 runs, Tue 03");
        expect(tooltip()!.style.right).toBe(`calc(100% - ${3 * PITCH - 10}px)`);
        // 12px above the second row
        expect(tooltip()!.style.top).toBe(`${PITCH - 12}px`);
        expect(keyColor()).toBe("var(--heat-5)");
        expect(axis().children).toHaveLength(2);
        expect(axis().children[1].classList.contains("text-ink")).toBe(true);
    });

    it("keys an empty cell in grey and uses the singular unit for one", () => {
        renderHeatmap();
        fireEvent.pointerMove(chart(), point(1, 1));
        expect(liveText(document)).toBe("0 runs, Tue 01");
        expect(keyColor()).toBe("var(--segment-off)");
        fireEvent.pointerMove(chart(), point(1, 0));
        expect(liveText(document)).toBe("1 run, Tue 00");
    });

    it("clears the readout when the pointer is over the totals strip or leaves", () => {
        renderHeatmap();
        fireEvent.pointerMove(chart(), point(0, 2));
        expect(liveText(document)).toBe("20 runs, Mon 02");
        fireEvent.pointerMove(chart(), { clientX: 5, clientY: 2 * PITCH + 10 });
        expect(liveText(document)).toBe("");
        fireEvent.pointerMove(chart(), point(0, 2));
        fireEvent.pointerLeave(chart());
        expect(tooltip()).toBeNull();
    });

    it("starts the keyboard at the newest cell and clears on blur", () => {
        renderHeatmap();
        fireEvent.keyDown(chart(), { key: "ArrowUp" });
        expect(liveText(document)).toBe("1,200 runs, Tue 03");
        fireEvent.keyDown(chart(), { key: "ArrowUp" });
        expect(liveText(document)).toBe("70 runs, Mon 03");
        fireEvent.blur(chart());
        expect(liveText(document)).toBe("");
    });

    it("uses the given column captions and axis columns", () => {
        renderHeatmap({
            axisColumns: [1, 2],
            columnCaptions: ["00:00–01:00", "01:00–02:00", "02:00–03:00", "03:00–04:00"],
            totals: false,
        });
        expect([...axis().children].map((span) => span.textContent)).toEqual(["01", "02"]);
        expect(hasFill("var(--chart-context)")).toBe(false);
        fireEvent.pointerMove(chart(), point(0, 2));
        expect(liveText(document)).toBe("20 runs, Mon 02:00–03:00");
    });

    it("treats a cell missing from a short row as zero", () => {
        renderHeatmap({ values: [[5], [1, 2, 3, 4]] });
        fireEvent.pointerMove(chart(), point(0, 2));
        expect(liveText(document)).toBe("0 runs, Mon 02");
    });

    it("lists every cell in the table view", () => {
        renderHeatmap({ rowTitle: "Weekday" });
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table");
        expect(within(table).getByText("Busiest on Tuesday at 03")).toBeTruthy();
        const heads = within(table)
            .getAllByRole("columnheader")
            .map((th) => th.textContent);
        expect(heads).toEqual(["Weekday", "00", "01", "02", "03"]);
        const rows = within(table)
            .getAllByRole("row")
            .slice(1)
            .map((tr) => tr.textContent);
        expect(rows).toEqual(["Mon032070", "Tue1001,200"]);
        // Two rows and the totals strip (56px) plus the header
        expect((table.parentElement as HTMLElement).style.height).toBe("104px");
    });

    it("scrolls sideways when the grid is wider than the pane", () => {
        const columns = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
        renderHeatmap({ columnLabels: columns, values: [columns.map(() => 2), columns.map(() => 4)] });
        const frame = () => (document.querySelector(".w-max") as HTMLElement).parentElement!;
        expect(frame().className).toBe("");
        expect([...axis().children].map((span) => span.textContent)).toEqual(["00", "06", "12", "18", "23"]);
        resizeTo(200);
        expect(frame().className).toBe("table-scroll pb-2");
    });

    it("says there is no data when the range is empty", () => {
        renderHeatmap({ values: [], emptyText: "No runs this week" });
        expect(chart().getAttribute("aria-label")).toBe("No runs this week");
        expect(chart().getAttribute("tabindex")).toBe("-1");
        expect(screen.getByText("No runs this week")).toBeTruthy();
        fireEvent.pointerMove(chart(), point(0, 0));
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No runs this week")).toBeTruthy();
    });

    it("sweeps an unlit grid while loading", () => {
        const { container } = renderHeatmap({ state: "loading", readouts: [{ label: "Peak", value: "70" }] });
        expect(chart().getAttribute("aria-label")).toBe("Activity, loading");
        expect(screen.getByText("Peak").nextElementSibling!.querySelector(".skel")).toBeTruthy();
        expect(hasFill("var(--heat-5)")).toBe(false);
        runFrame(700);
        expect(sweepFills(container).length).toBeGreaterThan(0);
        fireEvent.keyDown(chart(), { key: "ArrowUp" });
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("Loading…")).toBeTruthy();
    });

    it("keeps the grid readable while refetching", () => {
        renderHeatmap({ state: "refetching", tag: "7d", className: "wide" });
        expect(screen.getByRole("region", { name: "Activity" }).className).toContain("wide");
        expect(screen.getByText("7d")).toBeTruthy();
        fireEvent.pointerMove(chart(), point(0, 3));
        expect(liveText(document)).toBe("70 runs, Mon 03");
    });
});
