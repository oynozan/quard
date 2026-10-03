import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { EDGES, NODES } from "../../../../test/agents-graph-timeline/fixtures";
import type { AgentGraph } from "@/lib/data/agents";
import AgentsPage, { metadata } from "./page";

const query = vi.hoisted(() => ({ getAgentGraph: vi.fn<() => Promise<AgentGraph>>() }));
vi.mock("@/lib/data/agents", () => ({ getAgentGraph: query.getAgentGraph }));

const graphOf = (graph: Partial<AgentGraph>) =>
    query.getAgentGraph.mockResolvedValue({ windowDays: 30, nodes: [], edges: [], ...graph });

describe("AgentsPage", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Agents");
    });

    it("shows the agent graph beside a roster linking to every agent", async () => {
        graphOf({ nodes: NODES, edges: EDGES });
        render(await AgentsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeTruthy();
        expect(within(screen.getByRole("region", { name: "Agent graph" })).getByRole("img")).toBeTruthy();
        const roster = within(screen.getByRole("region", { name: "Agents" })).getAllByRole("link");
        expect(roster.map((link) => link.getAttribute("href")).sort()).toEqual(
            NODES.map((node) => `/agents/${node.name}`).sort(),
        );
    });

    it("draws agents that never talk to each other as nodes with no links", async () => {
        graphOf({ nodes: NODES });
        render(await AgentsPage());
        const graph = within(screen.getByRole("region", { name: "Agent graph" }));
        const summary =
            "Agent graph over the last 30 days: 4 agents and 0 links. 0 links carry mostly untrusted content.";
        expect(graph.getByRole("img", { name: summary })).toBeTruthy();
        expect(graph.getAllByRole("link")).toHaveLength(NODES.length);
        expect(within(screen.getByRole("region", { name: "Agents" })).getAllByRole("link")).toHaveLength(NODES.length);
    });

    it("keeps the graph and the roster panes for a brand-new project", async () => {
        graphOf({});
        render(await AgentsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeTruthy();
        const graph = within(screen.getByRole("region", { name: "Agent graph" }));
        expect(graph.getByText("30D")).toBeTruthy();
        expect(graph.getByText("No agents reported in the last 30 days")).toBeTruthy();
        expect(graph.getByRole("button", { name: "Table" })).toBeTruthy();
        const roster = within(screen.getByRole("region", { name: "Agents" }));
        expect(roster.getByText("0")).toBeTruthy();
        expect(roster.getByRole("status").textContent).toBe("No agents yet");
    });
});
