import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import { getAgentGraph } from "@/lib/data/agents";
import AgentsPage, { metadata } from "./page";

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
        const graph = await getAgentGraph();
        render(await AgentsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeTruthy();
        const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
        for (const node of graph.nodes) expect(links).toContain(`/agents/${encodeURIComponent(node.name)}`);
    });
});
