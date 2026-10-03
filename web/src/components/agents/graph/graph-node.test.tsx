import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentNode } from "@/lib/data/agents";
import type { Orientation, PlacedNode } from "../lib/graph-geometry";
import { agentNode } from "../../../../test/agents-graph-timeline/fixtures";
import { GraphNode } from "./graph-node";

const PLANNER = agentNode("planner", { state: "running", version: "v3", model: "claude-x" });

type Setup = { agent?: AgentNode; orientation?: Orientation; side?: PlacedNode["side"]; dim?: boolean };

function renderNode({ agent = PLANNER, orientation = "across", side = "after", dim = false }: Setup = {}) {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const node: PlacedNode = { name: agent.name, layer: 0, slot: 0, x: 250, y: 60, side };
    const view = render(
        <ul>
            <GraphNode
                node={node}
                agent={agent}
                orientation={orientation}
                width={900}
                height={300}
                dim={dim}
                onFocus={onFocus}
                onBlur={onBlur}
            />
        </ul>,
    );
    return { link: screen.getByRole("link", { name: new RegExp(`^${agent.name},`) }), onFocus, onBlur, ...view };
}

describe("GraphNode", () => {
    it("links to the agent page and names its state, version and model", () => {
        const { link } = renderNode();
        expect(link.getAttribute("href")).toBe("/agents/planner");
        expect(link.getAttribute("aria-label")).toBe("planner, running, v3, claude-x");
    });

    it("encodes agent names that are not safe in a path", () => {
        const { link } = renderNode({ agent: agentNode("data bot/2", { state: "offline" }) });
        expect(link.getAttribute("href")).toBe("/agents/data%20bot%2F2");
        expect(link.getAttribute("aria-label")).toBe("data bot/2, offline, v3, claude-x");
    });

    it("puts the label after the square and the chevron after the name when laid across", () => {
        const { link } = renderNode();
        expect(link.style.left).toBe("243px");
        expect(link.style.top).toBe("43px");
        expect(link.textContent).toBe("plannerv3 · claude-x");
        expect(screen.getByText("planner").nextElementSibling?.tagName).toBe("svg");
    });

    it("anchors the label to the right of the square for the first layer", () => {
        const { link } = renderNode({ side: "before" });
        expect(link.style.right).toBe("643px");
        expect(link.style.left).toBe("");
        expect(link.className).toContain("flex-row-reverse");
    });

    it("centers a fixed-width label under the square when laid down, with the chevron by the version", () => {
        const { link } = renderNode({ orientation: "down" });
        expect(link.style.left).toBe("198px");
        expect(link.style.width).toBe("104px");
        expect(link.style.top).toBe("53px");
        expect(link.textContent).toBe("plannerv3");
        expect(screen.getByText("v3").nextElementSibling?.tagName).toBe("svg");
        expect(screen.getByText("planner").nextElementSibling).toBeNull();
    });

    it("puts the label above the square for the first layer when laid down", () => {
        const { link } = renderNode({ orientation: "down", side: "before" });
        expect(link.style.bottom).toBe("233px");
        expect(link.style.top).toBe("");
        expect(link.className).toContain("flex-col-reverse");
    });

    it("draws each state's square and mutes only offline names", () => {
        const looks = (["running", "idle", "offline"] as const).map((state) => {
            const { link, unmount } = renderNode({ agent: agentNode(state, { state }) });
            const look = [link.firstElementChild?.className, screen.getByText(state).parentElement?.className];
            unmount();
            return look;
        });
        expect(looks.map(([square]) => square?.includes("bg-signal"))).toEqual([true, false, false]);
        expect(looks.map(([square]) => square?.includes("bg-chart-context"))).toEqual([false, true, false]);
        expect(looks.map(([square]) => square?.includes("border-line-strong"))).toEqual([false, false, true]);
        expect(looks.map(([, name]) => name?.includes("text-ink-subtle"))).toEqual([false, false, true]);
    });

    it("fades only when another part of the graph is in focus", () => {
        expect(renderNode({ dim: true }).link.className).toContain("opacity-35");
        expect(renderNode({ agent: agentNode("idle") }).link.className).not.toContain("opacity-35");
    });

    it("reports hover and keyboard focus to the graph", () => {
        const { link, onFocus, onBlur } = renderNode();
        fireEvent.mouseEnter(link);
        fireEvent.mouseLeave(link);
        fireEvent.focus(link);
        fireEvent.blur(link);
        expect(onFocus).toHaveBeenCalledTimes(2);
        expect(onBlur).toHaveBeenCalledTimes(2);
    });
});
