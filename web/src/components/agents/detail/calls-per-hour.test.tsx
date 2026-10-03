import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { ACTIVITY_START } from "../../../../test/agents-lib-detail/fixtures";
import { CallsPerHour } from "./calls-per-hour";

beforeEach(stubBrowser);
afterEach(() => {
    vi.unstubAllGlobals();
});

const hours = (count: (hour: number) => number) => Array.from({ length: 24 }, (_, hour) => count(hour));

const EMPTY = "No model calls in the last 24 hours";

// The empty chart keeps its tag, its x labels and an unlit field, with dashes for the readout
function expectEmptyChart(): HTMLElement {
    const pane = screen.getByRole("region", { name: "Model calls per hour" });
    expect(within(pane).getByText("24H")).toBeTruthy();
    expect(within(pane).getByRole("img", { name: EMPTY })).toBeTruthy();
    expect(within(pane).getByText(EMPTY)).toBeTruthy();
    expect(within(pane).getByText("19:00")).toBeTruthy();
    expect(within(pane).getByText("Total").nextElementSibling?.textContent).toBe("—");
    return pane;
}

describe("CallsPerHour", () => {
    it("describes the hourly model calls with the peak hour and the latest count", () => {
        const perHour = hours((hour) => (hour === 5 ? 1200 : 7));
        render(<CallsPerHour name="researcher" activity={{ startAt: ACTIVITY_START, perHour }} />);
        const chart = screen.getByRole("region", { name: "Model calls per hour" });
        const summary = "Model calls by researcher per hour over the last 24 hours. Peak 1,200 at 00:00 UTC, latest 7.";
        expect(within(chart).getByRole("img", { name: summary })).toBeTruthy();
        expect(within(chart).getByText("24H")).toBeTruthy();
        expect(within(chart).getByText("Total").nextElementSibling?.textContent).toBe("1,361");
    });

    it("starts the hours where the window starts", () => {
        render(<CallsPerHour name="researcher" activity={{ startAt: ACTIVITY_START, perHour: hours(() => 1) }} />);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows).toHaveLength(24);
        expect(rows[0]?.firstElementChild?.textContent).toBe("19:00–20:00");
        expect(rows[23]?.firstElementChild?.textContent).toBe("18:00–19:00");
    });

    it("keeps the chart frame with the knockout sentence when every hour is empty", () => {
        render(<CallsPerHour name="researcher" activity={{ startAt: ACTIVITY_START, perHour: hours(() => 0) }} />);
        const pane = expectEmptyChart();
        fireEvent.click(within(pane).getByRole("button", { name: "Table" }));
        const table = within(pane).getByRole("table", { name: "researcher made no model calls in the last 24 hours" });
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent),
        ).toEqual(["Time", "Calls"]);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(within(pane).getByText(EMPTY)).toBeTruthy();
    });

    it("draws the same empty chart from no hours at all, with no broken numbers", () => {
        render(<CallsPerHour name="researcher" activity={{ startAt: ACTIVITY_START, perHour: [] }} />);
        const pane = expectEmptyChart();
        expect(pane.textContent).not.toMatch(/NaN|Infinity|undefined/);
    });
});
