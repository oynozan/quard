import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/data/overview";
import { stubResizeObserver } from "../../../test/overview/browser";
import { overview, QUIET } from "../../../test/overview/fixtures";
import { TerminalOverview } from "./terminal-overview";

beforeEach(() => {
    stubResizeObserver();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

type Parts = Pick<OverviewData, "runsPerHour" | "coverage" | "blockRate" | "decisions24h">;

function renderParts(parts: Partial<Parts> = {}) {
    const data = { ...overview(), ...parts };
    return render(
        <TerminalOverview
            runsPerHour={data.runsPerHour}
            coverage={data.coverage}
            blockRate={data.blockRate}
            decisions24h={data.decisions24h}
        />,
    );
}

const pane = (name: string) => within(screen.getByRole("region", { name }));

describe("TerminalOverview", () => {
    it("totals the runs of the last 24 hours and shows the last hour", () => {
        renderParts({ runsPerHour: [400, 600, 136] });
        const runs = pane("Runs");

        expect(runs.getByText("1,136")).toBeTruthy();
        expect(runs.getByText("136 now")).toBeTruthy();
        expect(runs.getByText("24H")).toBeTruthy();
        const name = "Runs per hour over the last 24 hours, 136 in the last hour";
        expect(runs.getByRole("img", { name })).toBeTruthy();
    });

    it("shows how many of the tools used in the last 24 hours are guarded", () => {
        renderParts();
        const tools = pane("Guarded tools");

        expect(tools.getByText("24H")).toBeTruthy();
        expect(tools.getByText("18")).toBeTruthy();
        expect(tools.getByText("18 / 21")).toBeTruthy();
        const meter = tools.getByRole("progressbar", { name: "18 of 21 tools the agents use are guarded" });
        expect(meter.getAttribute("aria-valuenow")).toBe("18");
    });

    it("shows the block rate trace against its review limit", () => {
        renderParts();
        const trace = pane("Block rate");

        expect(trace.getByRole("heading", { name: "Block rate" })).toBeTruthy();
        expect(trace.getByText(/^Review at/).textContent).toBe("Review at 2.00%");
        expect(trace.getByLabelText(/^Block rate per day over 30 days\. Never over the 2\.00% limit/)).toBeTruthy();
    });

    it("pads blocked and asked counts to two digits and gives the compact number on hover", () => {
        renderParts();
        const decisions = pane("Guard decisions");

        const blocked = decisions.getByText("05");
        expect(blocked.getAttribute("title")).toBe("5");
        expect(blocked.parentElement?.textContent).toBe("Blocked05");
        const asked = decisions.getByText("10");
        expect(asked.parentElement?.textContent).toBe("Asked a human10");
        expect(asked.parentElement?.className).toContain("border-l");
        expect(blocked.parentElement?.className).not.toContain("border-l");
    });

    it("pads a small guarded count and shortens a large decision count on hover", () => {
        renderParts({
            runsPerHour: [0, 2],
            coverage: { guarded: 3, seen: 4 },
            decisions24h: { blocked: 1500, asked: 0 },
        });

        expect(pane("Guarded tools").getByText("03")).toBeTruthy();
        expect(pane("Runs").getByText("2 now")).toBeTruthy();
        expect(pane("Guard decisions").getByText("1500").getAttribute("title")).toBe("1.5K");
        expect(pane("Guard decisions").getByText("00").getAttribute("title")).toBe("0");
    });

    it("keeps no guarded tools and a 0% block rate as data", () => {
        renderParts({
            coverage: { guarded: 0, seen: 3 },
            blockRate: { values: Array<number>(30).fill(0), limit: 2, startAt: 0 },
        });

        expect(pane("Guarded tools").getByText("0 / 3")).toBeTruthy();
        expect(pane("Guarded tools").getByRole("progressbar")).toBeTruthy();
        expect(pane("Block rate").getByLabelText(/Today 0\.00%\.$/)).toBeTruthy();
    });

    it("draws a missing runs series as 24 empty hours", () => {
        renderParts({ runsPerHour: [] });
        const runs = pane("Runs");

        expect(runs.getByText("Per hour").parentElement?.textContent).toBe("Per hour0 now");
        const sparkline = runs.getByRole("img", { name: "Runs per hour over the last 24 hours, 0 in the last hour" });
        expect(Number(sparkline.getAttribute("width"))).toBeGreaterThan(0);
    });

    it("keeps every pane with zeros, and the block rate frame unlit, when its window had nothing", () => {
        renderParts(QUIET);

        const runs = pane("Runs");
        expect(runs.getByText("24H")).toBeTruthy();
        expect(runs.getByText("Per hour").parentElement?.textContent).toBe("Per hour0 now");
        const sparkline = runs.getByRole("img", { name: "Runs per hour over the last 24 hours, 0 in the last hour" });
        expect(sparkline.querySelector('path[fill="var(--chart-field)"]')?.getAttribute("d")).not.toBe("");
        expect(sparkline.querySelector('path[fill="var(--signal)"]')?.getAttribute("d")).toBe("");

        const tools = pane("Guarded tools");
        expect(tools.getByText("00")).toBeTruthy();
        expect(tools.getByText("0 / 0")).toBeTruthy();
        expect(tools.getByRole("progressbar", { name: "0 of 0 tools the agents use are guarded" })).toBeTruthy();

        const trace = pane("Block rate");
        expect(trace.getByText("30D")).toBeTruthy();
        expect(trace.getByRole("button", { name: "Table" })).toBeTruthy();
        expect(trace.getByText("Today").textContent).toBe("Today —");
        expect(trace.getByText(/^Review at/).textContent).toBe("Review at 2.00%");
        expect(trace.getByRole("img", { name: "No guarded tool calls in the last 30 days" })).toBeTruthy();
        expect(trace.getByText("No guarded tool calls in the last 30 days")).toBeTruthy();
        expect(trace.getByText("4 Sept")).toBeTruthy();

        const decisions = pane("Guard decisions");
        expect(decisions.getByText("Blocked").parentElement?.textContent).toBe("Blocked00");
        expect(decisions.getByText("Asked a human").parentElement?.textContent).toBe("Asked a human00");
    });
});
