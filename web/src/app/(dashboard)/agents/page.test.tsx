import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { EDGES, NODES } from "../../../../test/agents-graph-timeline/fixtures";
import { expectNoChartsOrTables } from "../../../../test/empty";
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

    it("lists agents that never talk to each other, with one line in place of the graph", async () => {
        graphOf({ nodes: NODES });
        render(await AgentsPage());
        const graph = screen.getByRole("region", { name: "Agent graph" });
        expect(within(graph).getByRole("status").textContent).toBe("No links between agents yet");
        expectNoChartsOrTables(graph);
        expect(within(screen.getByRole("region", { name: "Agents" })).getAllByRole("link")).toHaveLength(NODES.length);
    });

    it("shows a brand-new project as its heading and one line", async () => {
        graphOf({});
        render(await AgentsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No agents yet");
        expect(screen.queryByRole("region")).toBeNull();
        expectNoChartsOrTables();
    });
});
