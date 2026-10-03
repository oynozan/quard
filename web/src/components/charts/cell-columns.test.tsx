import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DAY, HOUR } from "@/lib/time";
import { liveText, resizeTo, runFrame, stubChartEnv, sweepFills, unstubChartEnv } from "../../../test/charts-cells/env";
import { CellColumns } from "./cell-columns";

const START = Date.UTC(2026, 9, 1);
const HOURLY = [2, 5, 1, 0, 8, 3];

type Props = Partial<ComponentProps<typeof CellColumns>>;

function renderColumns(props: Props = {}) {
    return render(
        <CellColumns
            title="Runs"
            values={HOURLY}
            startAt={START}
            bucketMs={HOUR}
            unit="runs"
            unitOne="run"
            summary="Runs peaked at 8 at 04:00"
            {...props}
        />,
    );
}

const chart = () => screen.getByRole("img");
const axis = () => document.querySelector(".mt-2") as HTMLElement;
const tooltip = () => document.querySelector('[role="presentation"]') as HTMLElement | null;
const yLabels = () => [...document.querySelector(".w-\\[34px\\]")!.children].map((span) => span.textContent);
const fillOf = (fill: string) => document.querySelector(`path[fill="${fill}"]`)?.getAttribute("d");
// At the default width each hourly group is 14 cells of 6px
const GROUP = 84;

beforeEach(stubChartEnv);
afterEach(unstubChartEnv);

describe("CellColumns", () => {
    it("labels every group on the axis when there is room", () => {
        renderColumns();
        expect(chart().getAttribute("aria-label")).toBe("Runs peaked at 8 at 04:00");
        expect(chart().getAttribute("tabindex")).toBe("0");
        const labels = [...axis().children].map((span) => span.textContent);
        expect(labels).toEqual(["00:00", "01:00", "02:00", "03:00", "04:00", "05:00"]);
        // A peak of 8 rounds the scale up to 9 in steps of 3
        expect(yLabels()).toEqual(["3", "6", "9", "0"]);
        expect(fillOf("var(--signal)")).toBeTruthy();
        expect(fillOf("var(--chart-context)")).toBeUndefined();
        expect(tooltip()).toBeNull();
        expect(liveText(document)).toBe("");
    });

    it("shows the nearest group's value under the pointer", () => {
        renderColumns();
        fireEvent.pointerMove(chart(), { clientX: GROUP + 10 });
        expect(liveText(document)).toBe("5 runs, 01:00–02:00");
        expect(tooltip()!.textContent).toBe("5runs01:00–02:00");
        expect(tooltip()!.style.left).toBe(`${40 + GROUP + 13 * 6 - 2 + 10}px`);
        // 52px above the top of a 70px column in a 142px field
        expect(tooltip()!.style.top).toBe("20px");
        expect(axis().children[1].className).toBe("absolute text-ink");
        expect(fillOf("var(--mint)")).toBeTruthy();

        fireEvent.pointerMove(chart(), { clientX: 2 * GROUP + 10 });
        expect(liveText(document)).toBe("1 run, 02:00–03:00");

        fireEvent.pointerLeave(chart());
        expect(liveText(document)).toBe("");
        expect(tooltip()).toBeNull();
    });

    it("flips the tooltip to the left of groups in the right half", () => {
        renderColumns();
        fireEvent.pointerMove(chart(), { clientX: 4 * GROUP + 10 });
        expect(liveText(document)).toBe("8 runs, 04:00–05:00");
        expect(tooltip()!.style.right).toBe(`calc(100% - ${40 + 4 * GROUP - 10}px)`);
        // The tallest column would push it above the field, so it stops at the top
        expect(tooltip()!.style.top).toBe("0px");
    });

    it("starts the keyboard at the newest group and clears on blur", () => {
        renderColumns();
        fireEvent.keyDown(chart(), { key: "ArrowLeft" });
        expect(liveText(document)).toBe("3 runs, 05:00–06:00");
        fireEvent.keyDown(chart(), { key: "ArrowLeft" });
        expect(liveText(document)).toBe("8 runs, 04:00–05:00");
        fireEvent.blur(chart());
        expect(liveText(document)).toBe("");
    });

    it("prints dollar values on the axis and lists each bucket in the table view", () => {
        renderColumns({ format: "usd", unit: "cost", unitOne: undefined });
        expect(yLabels()).toEqual(["$3.00", "$6.00", "$9.00", "0"]);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table");
        expect(within(table).getByText("Runs peaked at 8 at 04:00")).toBeTruthy();
        const heads = within(table)
            .getAllByRole("columnheader")
            .map((th) => th.textContent);
        expect(heads).toEqual(["Time", "Cost"]);
        const rows = within(table).getAllByRole("row");
        expect(rows[1].textContent).toBe("00:00–01:00$2.00");
        expect(rows).toHaveLength(7);
        // A 24-row field of 6px cells plus the header
        expect((table.parentElement as HTMLElement).style.height).toBe("160px");
    });

    it("names daily buckets by date and makes room for readouts", () => {
        renderColumns({ bucketMs: DAY, values: [4, 1, 7], readouts: [{ label: "Total", value: "12" }] });
        expect(screen.getByText("Total")).toBeTruthy();
        expect([...axis().children].map((span) => span.textContent)).toEqual(["1 Oct", "2 Oct", "3 Oct"]);
        fireEvent.keyDown(chart(), { key: "End" });
        expect(liveText(document)).toBe("7 runs, 3 Oct");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getAllByRole("columnheader")[0].textContent).toBe("Day");
        expect((screen.getByRole("table").parentElement as HTMLElement).style.height).toBe("190px");
    });

    it("merges days into ranges on a narrow pane and labels only a few", () => {
        const days = Array.from({ length: 31 }, (_, i) => i + 1);
        renderColumns({ bucketMs: DAY, values: days });
        resizeTo(100);
        const labels = [...axis().children];
        expect(labels.map((span) => span.textContent)).toEqual(["1 Oct", "9 Oct", "17 Oct", "25 Oct"]);

        fireEvent.keyDown(chart(), { key: "Home" });
        expect(liveText(document)).toBe("3 runs, 1 Oct – 2 Oct");
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(liveText(document)).toBe("7 runs, 3 Oct – 4 Oct");
        // The hovered group gets its own label and hides the marks it would touch
        expect(axis().lastElementChild!.textContent).toBe("3 Oct");
        expect(axis().lastElementChild!.className).toContain("text-ink");
        expect((labels[0] as HTMLElement).style.opacity).toBe("0");
        expect((labels[3] as HTMLElement).style.opacity).toBe("1");

        // The last group holds a single day
        fireEvent.keyDown(chart(), { key: "End" });
        expect(liveText(document)).toBe("31 runs, 31 Oct");
    });

    it("keeps the history grey and the newest group green", () => {
        renderColumns({ emphasis: "last" });
        expect(fillOf("var(--chart-context)")).toBeTruthy();
        expect(fillOf("var(--signal)")).toBeTruthy();
    });

    it("says there is no data when the range is empty", () => {
        renderColumns({ values: [], readouts: [{ label: "Total", value: "0" }] });
        expect(chart().getAttribute("aria-label")).toBe("No data in this range");
        expect(chart().getAttribute("tabindex")).toBe("-1");
        expect(screen.getAllByText("No data in this range")).toHaveLength(1);
        expect(screen.getByText("Total").nextElementSibling!.textContent).toBe("—");
        expect(yLabels()).toEqual(["—", "—", "—", "—"]);
        expect(fillOf("var(--signal)")).toBe("");
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No data in this range")).toBeTruthy();
    });

    it("sweeps an unlit field while loading", () => {
        const { container } = renderColumns({ values: [], state: "loading" });
        expect(chart().getAttribute("aria-label")).toBe("Runs, loading");
        expect(screen.queryByText("No data in this range")).toBeNull();
        expect(axis().children).toHaveLength(4);
        runFrame(700);
        expect(sweepFills(container).length).toBeGreaterThan(0);
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("Loading…")).toBeTruthy();
    });

    it("keeps the last frame readable while refetching", () => {
        renderColumns({ state: "refetching", tag: "24h", emptyText: "Quiet day", className: "wide" });
        expect(screen.getByRole("region", { name: "Runs" }).className).toContain("wide");
        expect(screen.getByText("24h")).toBeTruthy();
        fireEvent.pointerMove(chart(), { clientX: 10 });
        expect(liveText(document)).toBe("2 runs, 00:00–01:00");
    });
});
