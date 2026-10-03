import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { CALLS } from "../../../../test/agents-graph-timeline/fixtures";
import { ACTIVITY_START, detail, edge } from "../../../../test/agents-lib-detail/fixtures";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { NOW } from "../../../../test/time";
import { AgentView } from "./agent-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(stubBrowser);
afterEach(() => {
    vi.unstubAllGlobals();
});

const SECTIONS = ["Last 24 hours", "Recent calls", "Versions", "Incidents", "Permissions", "Model calls per hour"];

// An agent with calls, a link and model calls in the last 24 hours
const busy = detail({
    timeline: CALLS,
    links: [edge("researcher", "billing", { delegations: 2 })],
    activity: { startAt: ACTIVITY_START, perHour: Array.from({ length: 24 }, (_, hour) => hour) },
});

describe("AgentView", () => {
    it("puts the heading, the 24 hour numbers and every section on one page", () => {
        render(<AgentView detail={busy} now={NOW} />);
        expect(screen.getByRole("heading", { level: 1, name: "researcher" })).toBeTruthy();
        for (const name of SECTIONS) expect(screen.getByRole("region", { name })).toBeTruthy();
    });

    it("tells the agent's age from the request time", () => {
        render(<AgentView detail={busy} now={NOW} />);
        expect(screen.getByText("claude-sonnet").parentElement?.textContent).toBe("claude-sonnet·seen 3 h ago");
    });

    it("draws the recent calls and the hourly model calls once there are any", () => {
        render(<AgentView detail={busy} now={NOW} />);
        for (const name of ["Recent calls", "Model calls per hour"]) {
            expect(within(screen.getByRole("region", { name })).getByRole("img")).toBeTruthy();
        }
        const links = within(screen.getByRole("region", { name: "Permissions" })).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(["billing"]);
    });

    it("shows a quiet agent as headings and one line each, with no charts or tables", () => {
        render(<AgentView detail={detail()} now={NOW} />);
        for (const name of SECTIONS) expect(screen.getByRole("region", { name })).toBeTruthy();
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "No calls yet",
            "No versions yet",
            "No incidents yet",
            "No delegations in the last 30 days",
            "No model calls in the last 24 hours",
        ]);
        expect(screen.queryByRole("button", { name: "Table" })).toBeNull();
        expectNoChartsOrTables();
    });
});
