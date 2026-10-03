import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgent, type AgentDetail } from "@/lib/data/agents";
import { detail } from "../../../../test/agents-lib-detail/fixtures";
import { AgentView } from "./agent-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// jsdom has no ResizeObserver; the charts keep their starting width
class StillObserver {
    observe() {}
    disconnect() {}
}

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", StillObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

async function orchestrator(): Promise<AgentDetail> {
    const found = await getAgent("orchestrator");
    if (!found) throw new Error("The sample fleet has no orchestrator");
    return found;
}

describe("AgentView", () => {
    it("puts the heading, the 24 hour numbers and every section on one page", async () => {
        render(<AgentView detail={await orchestrator()} />);
        expect(screen.getByRole("heading", { level: 1, name: "orchestrator" })).toBeTruthy();
        for (const name of [
            "Last 24 hours",
            "Recent calls",
            "Versions",
            "Incidents",
            "Permissions",
            "Model calls per hour",
        ]) {
            expect(screen.getByRole("region", { name })).toBeTruthy();
        }
    });

    it("describes the hourly model calls with the peak hour and the latest count", () => {
        const activity = Array.from({ length: 24 }, (_, hour) => (hour === 5 ? 1200 : 7));
        render(<AgentView detail={detail({ activity })} />);
        const chart = screen.getByRole("region", { name: "Model calls per hour" });
        const summary = "Model calls by researcher per hour over the last 24 hours. Peak 1,200 at 23:40 UTC, latest 7.";
        expect(within(chart).getByRole("img", { name: summary })).toBeTruthy();
        expect(within(chart).getByText("Total").nextElementSibling?.textContent).toBe("1,361");
    });

    it("tells the reader when the agent made no model calls", () => {
        render(<AgentView detail={detail()} />);
        const chart = screen.getByRole("region", { name: "Model calls per hour" });
        const empty = "researcher made no model calls in the last 24 hours";
        expect(within(chart).getByRole("img", { name: empty })).toBeTruthy();
        expect(within(chart).getByText("Total").nextElementSibling?.textContent).toBe("—");
        fireEvent.click(within(chart).getByRole("button", { name: "Table" }));
        expect(chart.querySelector("caption")?.textContent).toBe(empty);
    });

    it("gives no peak hour when every hour had zero calls", () => {
        render(<AgentView detail={detail({ activity: Array.from({ length: 24 }, () => 0) })} />);
        const chart = screen.getByRole("region", { name: "Model calls per hour" });
        const empty = "researcher made no model calls in the last 24 hours";
        expect(within(chart).getByRole("img", { name: empty })).toBeTruthy();
        fireEvent.click(within(chart).getByRole("button", { name: "Table" }));
        expect(chart.querySelector("caption")?.textContent).toBe(empty);
    });
});
