import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeResizeObserver, observers, resizeAll } from "../../../test/charts-rest/dom";
import { CellTrace } from "./cell-trace";

// 30 days from 1 May; day 15 reaches 9%, today sits at 2%
const START = Date.UTC(2026, 4, 1);
const BREACHING = Array.from({ length: 30 }, (_, i) => (i === 14 ? 9 : i === 29 ? 2 : 1));
const CALM = BREACHING.map((v) => Math.min(v, 4));

function trace(values: number[] = BREACHING) {
    return render(<CellTrace title="Block rate" values={values} startAt={START} limit={5} limitLabel="Limit" />);
}

function chart() {
    return screen.getByRole("img", { name: /^Block rate per day/ });
}

function tooltip() {
    return document.querySelector('[role="presentation"]') as HTMLElement | null;
}

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("CellTrace", () => {
    it("sums up the month, the breach and today in the chart's label", () => {
        trace();
        expect(chart().getAttribute("aria-label")).toBe(
            "Block rate per day over 30 days. Once over the 5.00% limit: 9.00% on 15 May. Today 2.00%.",
        );
        expect(screen.getByRole("region", { name: "Block rate" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "Block rate" })).toBeTruthy();
    });

    it("marks the breach above the chart and draws the dashed limit", () => {
        const { container } = trace();
        const flag = screen.getByText("· 15 May").parentElement as HTMLElement;
        expect(flag.textContent).toBe("9.00% · 15 May");
        // Three columns right of day 15, which sits in column 34 of 6px each
        expect(flag.style.left).toBe("262px");
        // A 9% scale on 24 rows puts 5% on row 13, 64px from the top
        const limit = container.querySelector('line[stroke="var(--warning)"]');
        expect(limit?.getAttribute("y1")).toBe("64.5");
        expect(limit?.getAttribute("x2")).toBe("424");
        expect(container.querySelector('path[fill="var(--warning)"]')?.getAttribute("d")).not.toBe("");
    });

    it("says it never crossed the limit when every day stayed under it", () => {
        const { container } = trace(CALM);
        expect(container.querySelector('path[fill="var(--warning)"]')?.getAttribute("d")).toBe("");
        expect(chart().getAttribute("aria-label")).toBe(
            "Block rate per day over 30 days. Never over the 5.00% limit. Today 2.00%.",
        );
        expect(screen.queryByText(/· \d+ May/)).toBeNull();
    });

    it("shows today's rate, the limit, the axis and the first and last day", () => {
        const { container } = trace();
        expect(screen.getByText("Today").textContent).toBe("Today 2.00%");
        expect(screen.getByText("Limit").textContent).toBe("Limit 5.00%");
        const [axis] = container.querySelectorAll("div[aria-hidden].w-\\[34px\\]");
        expect(axis.textContent).toBe("3%6%9%0%");
        expect(screen.getByText("1 May")).toBeTruthy();
        expect(screen.getByText("30 May")).toBeTruthy();
    });

    it("never draws fewer than 20 columns in a narrow pane", () => {
        trace();
        expect(chart().getAttribute("width")).toBe("424");
        resizeAll(80);
        expect(chart().getAttribute("width")).toBe("118");
    });

    it("lists every day newest first in the table, flagging days over the limit", () => {
        trace();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.queryByRole("img")).toBeNull();
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows).toHaveLength(30);
        expect(rows[0].textContent).toBe("30 May2.00%—");
        expect(rows[15].textContent).toBe("15 May9.00%Yes");
        expect(rows[29].textContent).toBe("1 May1.00%—");
        fireEvent.click(screen.getByRole("button", { name: "Chart" }));
        expect(chart()).toBeTruthy();
    });
});

describe("CellTrace hover", () => {
    it("starts keyboard reading from today and steps back with the left arrow", () => {
        const { container } = trace();
        expect(tooltip()).toBeNull();
        expect(fireEvent.keyDown(chart(), { key: "ArrowLeft" })).toBe(false);
        expect(tooltip()?.textContent).toBe("1.00%blocked29 May");
        // Day 29 sits in column 67, so the tip hangs left of x = 40 + 402 - 10
        expect(tooltip()?.style.right).toBe("calc(100% - 432px)");
        expect(container.querySelector('rect[fill="var(--highlight)"]')?.getAttribute("x")).toBe("402");
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(tooltip()?.textContent).toBe("2.00%blocked30 May");
    });

    it("jumps to the first and last day with Home and End", () => {
        trace();
        fireEvent.keyDown(chart(), { key: "Home" });
        expect(tooltip()?.textContent).toBe("1.00%blocked1 May");
        expect(tooltip()?.style.left).toBe("54px");
        fireEvent.keyDown(chart(), { key: "ArrowLeft" });
        expect(tooltip()?.textContent).toBe("1.00%blocked1 May");
        fireEvent.keyDown(chart(), { key: "End" });
        expect(tooltip()?.textContent).toBe("2.00%blocked30 May");
    });

    it("keys the breach day in amber and others in mint", () => {
        trace();
        fireEvent.keyDown(chart(), { key: "Home" });
        const key = () => (tooltip()?.querySelector("[aria-hidden]") as HTMLElement).style.background;
        expect(key()).toBe("var(--mint)");
        for (let i = 0; i < 14; i++) fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(tooltip()?.textContent).toBe("9.00%blocked15 May");
        expect(key()).toBe("var(--warning)");
    });

    it("anchors the tip right of the point up to mid-month and left of it after", () => {
        trace();
        fireEvent.keyDown(chart(), { key: "Home" });
        for (let i = 0; i < 15; i++) fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(tooltip()?.textContent).toBe("1.00%blocked16 May");
        expect(tooltip()?.style.right).toBe("");
        fireEvent.keyDown(chart(), { key: "ArrowRight" });
        expect(tooltip()?.textContent).toBe("1.00%blocked17 May");
        expect(tooltip()?.style.left).toBe("");
    });

    it("ignores other keys and clears with Escape or on blur", () => {
        const { container } = trace();
        expect(fireEvent.keyDown(chart(), { key: "a" })).toBe(true);
        expect(tooltip()).toBeNull();
        fireEvent.keyDown(chart(), { key: "End" });
        fireEvent.keyDown(chart(), { key: "Escape" });
        expect(tooltip()).toBeNull();
        expect(container.querySelector('rect[fill="var(--highlight)"]')).toBeNull();
        fireEvent.keyDown(chart(), { key: "Home" });
        fireEvent.blur(chart());
        expect(tooltip()).toBeNull();
    });

    it("follows the pointer across the chart and clears when it leaves", () => {
        trace();
        vi.spyOn(chart(), "getBoundingClientRect").mockReturnValue({ left: 100 } as DOMRect);
        fireEvent.pointerMove(chart(), { clientX: 100 });
        expect(tooltip()?.textContent).toBe("1.00%blocked1 May");
        // The chart is 424px wide, so 14/29 of the way lands on day 15
        fireEvent.pointerMove(chart(), { clientX: 100 + (424 * 14) / 29 });
        expect(tooltip()?.textContent).toBe("9.00%blocked15 May");
        fireEvent.pointerMove(chart(), { clientX: 2000 });
        expect(tooltip()?.textContent).toBe("2.00%blocked30 May");
        fireEvent.pointerMove(chart(), { clientX: 0 });
        expect(tooltip()?.textContent).toBe("1.00%blocked1 May");
        fireEvent.pointerLeave(chart());
        expect(tooltip()).toBeNull();
    });
});
