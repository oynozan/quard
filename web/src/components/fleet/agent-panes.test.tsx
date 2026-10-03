import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetData } from "@/lib/data/fleet";
import { sampleFleet, stubBrowser } from "../../../test/fleet-shell/env";
import { AgentPanes } from "./agent-panes";

const POINTS: FleetData["agentPoints"] = [
    { agent: "support", entry: 2, turning: 0, damage: 0 },
    { agent: "billing", entry: 2, turning: 1, damage: 1 },
    { agent: "researcher", entry: 5, turning: 0, damage: 0 },
    { agent: "planner", entry: 0, turning: 0, damage: 3 },
];
const LINKS: FleetData["untrustedLinks"] = [
    { from: "researcher", to: "billing", total: 2400, untrusted: 1200, untrustedShare: 0.5 },
    { from: "support", to: "billing", total: 40, untrusted: 3, untrustedShare: 0.075 },
];

function pane(name: string) {
    return within(screen.getByRole("region", { name }));
}

// Flips a chart to its table view and reads the ranked names
function rankedNames(name: string): string[] {
    fireEvent.click(pane(name).getByRole("button", { name: "Table" }));
    return pane(name)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent ?? "");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("AgentPanes", () => {
    it("ranks entry points by count, then by name, leaving out agents with none", async () => {
        render(<AgentPanes fleet={await sampleFleet({ agentPoints: POINTS, untrustedLinks: LINKS })} />);
        expect(rankedNames("Entry points")).toEqual(["researcher", "billing", "support"]);
        expect(rankedNames("Turning points")).toEqual(["billing"]);
        expect(pane("Turning points").getByRole("table").querySelector("caption")?.textContent).toBe(
            "Agents where an incident turned harmful over the last 30 days. billing leads with 1 incidents, out of 1.",
        );
    });

    it("lists each untrusted link with its counts and share", async () => {
        render(<AgentPanes fleet={await sampleFleet({ agentPoints: POINTS, untrustedLinks: LINKS })} />);
        const rows = pane("Untrusted links").getAllByRole("row").slice(1);
        expect(rows).toHaveLength(2);
        const cells = within(rows[0]).getAllByRole("cell");
        expect(cells.map((cell) => cell.textContent)).toEqual(["researchertobilling", "1,200", "2,400", "50%"]);
        expect(within(rows[1]).getByRole("progressbar").getAttribute("aria-label")).toBe(
            "8% of messages from support to billing carry untrusted content",
        );
        expect(pane("Untrusted links").queryByRole("status")).toBeNull();
    });

    it("says so when no agent was an entry or turning point and no link was untrusted", async () => {
        const quiet = POINTS.map((point) => ({ ...point, entry: 0, turning: 0 }));
        render(<AgentPanes fleet={await sampleFleet({ agentPoints: quiet, untrustedLinks: [] })} />);
        expect(pane("Entry points").getByRole("img").getAttribute("aria-label")).toBe("No agent was an entry point");
        expect(pane("Turning points").getByRole("img").getAttribute("aria-label")).toBe("No agent was a turning point");
        expect(pane("Untrusted links").getByRole("status").textContent).toBe(
            "No agent-to-agent link carried untrusted content",
        );
    });

    it("shows loading charts and loading link rows before the fleet arrives", () => {
        render(<AgentPanes fleet={null} />);
        expect(pane("Entry points").getByRole("img").getAttribute("aria-label")).toBe("Entry points, loading");
        expect(pane("Untrusted links").getByRole("status").textContent).toBe("Loading links…");
        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(5);
    });
});
