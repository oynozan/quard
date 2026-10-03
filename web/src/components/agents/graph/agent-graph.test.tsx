import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentGraph as Graph } from "@/lib/data/agents";
import { agentNode, EDGES, NODES, NOON } from "../../../../test/agents-graph-timeline/fixtures";
import { stubResizeObserver } from "../../../../test/agents-graph-timeline/resize";
import { AgentGraph } from "./agent-graph";

beforeEach(stubResizeObserver);
afterEach(() => {
    vi.unstubAllGlobals();
});

function graphOf(overrides: Partial<Graph> = {}): Graph {
    // Quietest link first, so the pane has to sort them
    const edges = [EDGES[2], EDGES[0], EDGES[1]];
    return { windowDays: 7, startAt: NOON - 7 * 86_400_000, endAt: NOON, nodes: NODES, edges, ...overrides };
}

// The legend also says "Untrusted", so pick the label that has a mono value beside it
function readout(label: string): string | null | undefined {
    const value = screen.getAllByText(label).map((item) => item.nextElementSibling);
    return value.find((item) => item?.classList.contains("mono"))?.textContent;
}

describe("AgentGraph", () => {
    it("sums the links, messages and untrusted share over the window", () => {
        render(<AgentGraph graph={graphOf()} />);
        expect(screen.getByRole("region", { name: "Agent graph" }).textContent).toContain("7D");
        expect(readout("Links")).toBe("3");
        expect(readout("Messages")).toBe("352");
        expect(readout("Untrusted")).toBe("7%");
    });

    it("describes the graph, its busiest link and its mostly untrusted links", () => {
        render(<AgentGraph graph={graphOf()} />);
        const summary =
            "Agent graph over the last 7 days: 4 agents and 3 links. " +
            "The busiest link is planner to researcher with 300 messages. " +
            "1 link carries mostly untrusted content.";
        expect(screen.getByRole("img", { name: summary })).toBeTruthy();
        // The legend sits under the drawing
        expect(screen.getByText("60%+")).toBeTruthy();
    });

    it("lists every link busiest first behind the Table toggle", () => {
        render(<AgentGraph graph={graphOf()} />);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Links between agents over the last 7 days" });
        const rows = within(table).getAllByRole("row").slice(1);
        expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
            ["planner", "researcher", "Delegation", "300", "9", "3%", "3 Oct 12:00"],
            ["planner", "writer", "Delegation", "40", "8", "20%", "3 Oct 12:00"],
            ["researcher", "writer", "Message", "12", "9", "75%", "3 Oct 12:00"],
        ]);
    });

    it("shows a dash for the untrusted share and skips the busiest link when agents never talk", () => {
        render(<AgentGraph graph={graphOf({ nodes: [agentNode("solo")], edges: [] })} />);
        expect(readout("Links")).toBe("0");
        expect(readout("Untrusted")).toBe("—");
        const summary =
            "Agent graph over the last 7 days: 1 agent and 0 links. 0 links carry mostly untrusted content.";
        expect(screen.getByRole("img", { name: summary })).toBeTruthy();
    });

    it("says no agents reported when the window is empty", () => {
        render(<AgentGraph graph={graphOf({ windowDays: 30, nodes: [], edges: [] })} />);
        expect(screen.getByText("No agents reported in the last 30 days")).toBeTruthy();
        expect(screen.queryByRole("img")).toBeNull();
        expect(readout("Links")).toBe("—");
        expect(readout("Messages")).toBe("—");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No messages between agents yet")).toBeTruthy();
    });
});
