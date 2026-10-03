import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOverview } from "@/lib/data/overview";
import { stubResizeObserver } from "../../../test/approvals-overview/fixtures";
import { TerminalOverview } from "./terminal-overview";

beforeEach(() => {
    stubResizeObserver();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

async function renderOverview(runsPerHour?: number[]) {
    const data = await getOverview();
    render(
        <TerminalOverview
            runsPerHour={runsPerHour ?? data.runsPerHour}
            coverage={data.coverage}
            blockRate={data.blockRate}
            decisions24h={data.decisions24h}
        />,
    );
    return data;
}

const pane = (name: string) => within(screen.getByRole("region", { name }));

describe("TerminalOverview", () => {
    it("totals the runs of the last 24 hours and shows the last hour", async () => {
        await renderOverview([400, 600, 136]);
        const runs = pane("Runs");
        expect(runs.getByText("1,136")).toBeTruthy();
        expect(runs.getByText("136 now")).toBeTruthy();
        expect(runs.getByText("24H")).toBeTruthy();
        const name = "Runs per hour over the last 24 hours, 136 in the last hour";
        expect(runs.getByRole("img", { name })).toBeTruthy();
    });

    it("shows how many of the tools in use are guarded", async () => {
        await renderOverview();
        const tools = pane("Guarded tools");
        expect(tools.getByText("18")).toBeTruthy();
        expect(tools.getByText("18 / 21")).toBeTruthy();
        const meter = tools.getByRole("progressbar", { name: "18 of 21 tools the agents use are guarded" });
        expect(meter.getAttribute("aria-valuenow")).toBe("18");
    });

    it("shows the block rate trace against its review limit", async () => {
        await renderOverview();
        const trace = pane("Block rate");
        expect(trace.getByRole("heading", { name: "Block rate" })).toBeTruthy();
        expect(trace.getByText(/^Review at/).textContent).toBe("Review at 2.00%");
        expect(trace.getByLabelText(/^Block rate per day over 30 days\. Once over the 2\.00% limit/)).toBeTruthy();
    });

    it("pads blocked and asked counts to two digits and gives the compact number on hover", async () => {
        await renderOverview();
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
        render(
            <TerminalOverview
                runsPerHour={[0, 2]}
                coverage={{ guarded: 3, seen: 4 }}
                blockRate={{ values: [0.5, 1], limit: 2, startAt: 0 }}
                decisions24h={{ blocked: 1500, asked: 0 }}
            />,
        );
        expect(pane("Guarded tools").getByText("03")).toBeTruthy();
        expect(pane("Runs").getByText("2 now")).toBeTruthy();
        expect(pane("Guard decisions").getByText("1500").getAttribute("title")).toBe("1.5K");
        expect(pane("Guard decisions").getByText("00").getAttribute("title")).toBe("0");
    });
});
