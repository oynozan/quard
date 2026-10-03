import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveText, resizeTo, runFrame, stubChartEnv, sweepFills, unstubChartEnv } from "../../../test/charts-cells/env";
import { CellBars } from "./cell-bars";

const ITEMS = [
    { label: "deploy-bot", value: 1200 },
    { label: "triage", value: 600 },
    { label: "docs", value: 200 },
];

type Props = Partial<ComponentProps<typeof CellBars>>;

function renderBars(props: Props = {}) {
    return render(
        <CellBars
            title="Runs by agent"
            items={ITEMS}
            unit="runs"
            unitOne="run"
            summary="deploy-bot leads with 1,200 runs"
            {...props}
        />,
    );
}

const chart = () => screen.getByRole("img");
const rowOf = (label: string) => document.querySelector(`[title="${label}"]`)!.parentElement!;
const fillsOf = (row: HTMLElement) => [...row.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
// How many cells the bar lights, counting a partly lit last cell
const litCells = (row: HTMLElement) =>
    [...row.querySelectorAll("path")].at(-1)!.getAttribute("d")!.split("M").length - 1;
const valueLeft = (row: HTMLElement) => (row.querySelector(".mono.absolute") as HTMLElement).style.left;

beforeEach(stubChartEnv);
afterEach(unstubChartEnv);

describe("CellBars", () => {
    it("lists each item with its value and share of the total", () => {
        renderBars();
        expect(screen.getByRole("region", { name: "Runs by agent" })).toBeTruthy();
        expect(chart().getAttribute("aria-label")).toBe("deploy-bot leads with 1,200 runs");
        expect(chart().getAttribute("tabindex")).toBe("0");
        expect(rowOf("deploy-bot").textContent).toBe("deploy-bot1,200 60%");
        expect(rowOf("triage").textContent).toBe("triage600 30%");
        expect(rowOf("docs").textContent).toBe("docs200 10%");
        expect(rowOf("docs").firstElementChild!.className).toContain("mono");
        // The top bar fills the 27 cells left of the value text, the rest scale to it
        expect(["deploy-bot", "triage", "docs"].map((label) => litCells(rowOf(label)))).toEqual([27, 14, 5]);
        expect(valueLeft(rowOf("deploy-bot"))).toBe("275px");
        expect(valueLeft(rowOf("docs"))).toBe("55px");
        expect(liveText(document)).toBe("");
    });

    it("lands on the top item first and reads it out on arrow keys", () => {
        renderBars();
        fireEvent.keyDown(chart(), { key: "ArrowDown" });
        expect(liveText(document)).toBe("deploy-bot, 1,200 runs, 60%");
        fireEvent.keyDown(chart(), { key: "ArrowDown" });
        expect(liveText(document)).toBe("triage, 600 runs, 30%");
        expect(rowOf("triage").firstElementChild!.className).toContain("text-ink");
        expect(fillsOf(rowOf("triage"))).toEqual(["var(--highlight)", "var(--mint)"]);
        expect(fillsOf(rowOf("docs"))).toEqual(["var(--chart-field)", "var(--signal)"]);
        fireEvent.blur(chart());
        expect(liveText(document)).toBe("");
    });

    it("follows the pointer from row to row and clears when it leaves", () => {
        renderBars();
        fireEvent.pointerEnter(rowOf("docs"));
        expect(liveText(document)).toBe("docs, 200 runs, 10%");
        fireEvent.pointerLeave(chart());
        expect(liveText(document)).toBe("");
    });

    it("uses the singular unit for a value of one", () => {
        renderBars({ items: [{ label: "solo", value: 1 }] });
        fireEvent.keyDown(chart(), { key: "Home" });
        expect(liveText(document)).toBe("solo, 1 run, 100%");
    });

    it("measures shares against a given total and hides them when asked", () => {
        const { unmount } = renderBars({ total: 4000 });
        expect(rowOf("deploy-bot").textContent).toBe("deploy-bot1,200 30%");
        unmount();

        renderBars({ showShare: false, format: "usd", monoLabels: false, max: 5000 });
        expect(rowOf("triage").textContent).toBe("triage$600.00");
        expect(rowOf("triage").firstElementChild!.className).not.toContain("mono");
        // Against a max of 5,000 the top bar lights about 6.5 of its 27 cells
        expect(litCells(rowOf("deploy-bot"))).toBe(7);
        fireEvent.keyDown(chart(), { key: "End" });
        expect(liveText(document)).toBe("docs, $200.00 runs");
    });

    it("draws quiet grey bars for a context list", () => {
        renderBars({ tone: "context" });
        expect(fillsOf(rowOf("triage"))).toEqual(["var(--chart-field)", "var(--chart-context)"]);
    });

    it("shows the same items as a table", () => {
        renderBars();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table");
        expect(within(table).getByText("deploy-bot leads with 1,200 runs")).toBeTruthy();
        const heads = within(table)
            .getAllByRole("columnheader")
            .map((th) => th.textContent);
        expect(heads).toEqual(["Name", "Runs", "Share"]);
        const cells = within(table)
            .getAllByRole("row")
            .slice(1)
            .map((tr) => tr.textContent);
        expect(cells).toEqual(["deploy-bot1,20060%", "triage60030%", "docs20010%"]);
        // Three rows of 28px plus the header
        expect((table.parentElement as HTMLElement).style.height).toBe("114px");
    });

    it("makes the table taller when a readout row sits above the chart", () => {
        renderBars({ readouts: [{ label: "Agents", value: "3" }] });
        expect(screen.getByText("Agents")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect((screen.getByRole("table").parentElement as HTMLElement).style.height).toBe("144px");
    });

    it("draws placeholder rows with skeleton labels while loading", () => {
        const { container } = renderBars({ state: "loading", placeholderRows: 4 });
        expect(chart().getAttribute("aria-label")).toBe("Runs by agent, loading");
        expect(chart().getAttribute("tabindex")).toBe("-1");
        expect(container.querySelectorAll(".skel")).toHaveLength(4);
        expect(screen.queryByText("deploy-bot")).toBeNull();
        expect(screen.queryByText("Nothing to rank yet")).toBeNull();
        expect(sweepFills(container)).toEqual([]);
        runFrame(700);
        expect(sweepFills(container).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("Loading…")).toBeTruthy();
    });

    it("says there is nothing to rank when the list is empty", () => {
        const { container } = renderBars({ items: [] });
        expect(chart().getAttribute("aria-label")).toBe("Nothing to rank yet");
        // Centered on the full-width track over the middle of five empty rows, with no label column
        const message = screen.getByText("Nothing to rank yet");
        expect([message.style.left, message.style.top, message.style.width]).toEqual(["190px", "56px", "140px"]);
        expect(container.querySelectorAll(".skel")).toHaveLength(0);
        fireEvent.pointerEnter(chart().firstElementChild!);
        fireEvent.keyDown(chart(), { key: "ArrowDown" });
        expect(liveText(document)).toBe("");
    });

    it("shows its own empty text in the chart and the table", () => {
        renderBars({ state: "empty", emptyText: "No agents ran" });
        expect(chart().getAttribute("aria-label")).toBe("No agents ran");
        expect(screen.getByText("No agents ran")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No agents ran")).toBeTruthy();
    });

    it("keeps the bars readable while refetching", () => {
        renderBars({ state: "refetching", tag: "24h", className: "col-span-2" });
        expect(screen.getByRole("region").className).toContain("col-span-2");
        expect(screen.getByText("24h")).toBeTruthy();
        expect(rowOf("triage").textContent).toBe("triage600 30%");
    });

    it("narrows the label column to fit a small pane", () => {
        renderBars();
        expect((rowOf("triage") as HTMLElement).style.gridTemplateColumns).toBe("166px minmax(0, 1fr)");
        resizeTo(200);
        expect((rowOf("triage") as HTMLElement).style.gridTemplateColumns).toBe("96px minmax(0, 1fr)");
    });
});
