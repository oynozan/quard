import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEdge, AgentNode } from "@/lib/data/agents";
import { agentEdge, EDGES, NODES } from "../../../../test/agents-graph-timeline/fixtures";
import { resizeAll, stubResizeObserver } from "../../../../test/agents-graph-timeline/resize";
import { GraphField } from "./graph-field";

beforeEach(stubResizeObserver);
afterEach(() => {
    vi.unstubAllGlobals();
});

function renderField(nodes: AgentNode[] = NODES, edges: AgentEdge[] = EDGES) {
    const view = render(<GraphField nodes={nodes} edges={edges} summary="Four agents and three links." />);
    const field = screen.getByRole("img", { name: "Four agents and three links." });
    const groups = () => [...view.container.querySelectorAll("svg g")];
    const tooltip = () => view.container.querySelector('[role="presentation"]');
    const announced = () => view.container.querySelector("[aria-live]")?.textContent;
    const link = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name},`) });
    return { ...view, field, groups, tooltip, announced, link };
}

describe("GraphField drawing", () => {
    it("explains the keys and draws one arrowed line per link", () => {
        const { field, groups, container } = renderField();
        const keys = document.getElementById(field.getAttribute("aria-describedby") ?? "");
        expect(keys?.textContent).toContain("Use the arrow keys to step through the links.");
        expect(groups()).toHaveLength(3);
        expect(container.querySelectorAll("marker")).toHaveLength(4);
        for (const group of groups()) {
            // "url(#id)" points at a marker drawn in the same svg
            const marker = group.firstElementChild?.getAttribute("marker-end")?.slice(5, -1);
            expect(container.querySelector(`marker[id="${marker}"]`)).toBeTruthy();
        }
    });

    it("colors lines by untrusted share, weights them by volume and dashes mostly untrusted ones", () => {
        const lines = renderField()
            .groups()
            .map((group) => group.firstElementChild);
        expect(lines.map((line) => line?.getAttribute("stroke"))).toEqual([
            "var(--chart-context)",
            "var(--cat-3)",
            "var(--caution-text)",
        ]);
        expect(lines.map((line) => line?.getAttribute("stroke-width"))).toEqual(["1.5", "1", "1"]);
        expect(lines.map((line) => line?.getAttribute("stroke-dasharray"))).toEqual([null, null, "5 3"]);
        expect(lines[2]?.getAttribute("marker-end")).toMatch(/-untrusted\)$/);
    });

    it("lists every agent as a link at full strength while nothing is in focus", () => {
        const { link, tooltip, announced } = renderField();
        for (const node of NODES) expect(link(node.name).className).not.toContain("opacity-35");
        expect(screen.getByRole("list", { name: "Agents" }).children).toHaveLength(4);
        expect(tooltip()).toBeNull();
        expect(announced()).toBe("");
    });

    it("stacks the layers top to bottom on a narrow pane", () => {
        const { link, container } = renderField();
        resizeAll(500);
        expect(container.querySelector("svg")?.getAttribute("width")).toBe("500");
        expect(link("planner").style.width).toBe("104px");
    });
});

describe("GraphField links", () => {
    it("lands the first arrow key on the busiest link and reads it out", () => {
        const { field, groups, tooltip, announced, link } = renderField();
        fireEvent.keyDown(field, { key: "ArrowRight" });
        expect(groups().map((group) => group.getAttribute("opacity"))).toEqual(["1", "0.22", "0.22"]);
        const line = groups()[0].firstElementChild;
        expect(line?.getAttribute("stroke")).toBe("var(--mint)");
        expect(line?.getAttribute("marker-end")).toMatch(/-hover\)$/);
        expect(tooltip()?.textContent).toBe("300messagesplanner to researcher · 3% untrusted");
        expect((tooltip() as HTMLElement).style.left).not.toBe("");
        expect(announced()).toBe("planner to researcher: 300 messages, 3% untrusted");
        expect(link("researcher").className).not.toContain("opacity-35");
        expect(link("writer").className).toContain("opacity-35");
        expect(link("archivist").className).toContain("opacity-35");
    });

    it("steps to the last link and shows its readout on the left of a right-hand link", () => {
        const { field, tooltip, announced } = renderField();
        fireEvent.keyDown(field, { key: "End" });
        expect(tooltip()?.textContent).toBe("12messagesresearcher to writer · 75% untrusted");
        expect((tooltip() as HTMLElement).style.right).not.toBe("");
        expect(announced()).toBe("researcher to writer: 12 messages, 75% untrusted");
    });

    it("clears the readout when focus leaves the drawing", () => {
        const { field, tooltip } = renderField();
        fireEvent.keyDown(field, { key: "ArrowRight" });
        fireEvent.blur(field);
        expect(tooltip()).toBeNull();
    });

    it("reads out a link under the pointer until the pointer leaves", () => {
        const { groups, tooltip } = renderField();
        const hit = groups()[1].lastElementChild as Element;
        fireEvent.mouseEnter(hit);
        expect(tooltip()?.textContent).toBe("40messagesplanner to writer · 20% untrusted");
        fireEvent.mouseLeave(hit);
        expect(tooltip()).toBeNull();
    });

    it("keeps the keyboard link in focus while the pointer rests on an agent", () => {
        const { field, tooltip, link } = renderField();
        fireEvent.keyDown(field, { key: "End" });
        fireEvent.mouseEnter(link("archivist"));
        expect(tooltip()?.textContent).toBe("12messagesresearcher to writer · 75% untrusted");
        fireEvent.blur(field);
        expect(tooltip()?.textContent).toBe("0runs in 24hIdle");
    });

    it("drops a stale link readout and undims every line when the links change under the pointer", () => {
        const { groups, tooltip, announced, rerender, link } = renderField();
        fireEvent.mouseEnter(groups()[2].lastElementChild as Element);
        rerender(<GraphField nodes={NODES} edges={EDGES.slice(0, 2)} summary="Four agents and two links." />);
        expect(tooltip()).toBeNull();
        expect(announced()).toBe("");
        expect(groups().map((group) => group.getAttribute("opacity"))).toEqual(["1", "1"]);
        for (const node of NODES) expect(link(node.name).className).not.toContain("opacity-35");
    });
});

describe("GraphField agents", () => {
    it("reads out an agent's runs and state, and lights its links and neighbors", () => {
        const { groups, tooltip, announced, link } = renderField();
        fireEvent.mouseEnter(link("planner"));
        expect(tooltip()?.textContent).toBe("12runs in 24hRunning");
        expect((tooltip()?.querySelector("span") as HTMLElement).style.background).toBe("var(--signal)");
        expect((tooltip() as HTMLElement).style.left).not.toBe("");
        expect(announced()).toBe("planner: 12 runs in 24 hours");
        expect(groups().map((group) => group.getAttribute("opacity"))).toEqual(["1", "1", "0.22"]);
        expect(link("writer").className).not.toContain("opacity-35");
        expect(link("archivist").className).toContain("opacity-35");
    });

    it("counts a single run in the singular and places the readout left of a right-hand agent", () => {
        const { tooltip, link } = renderField();
        fireEvent.focus(link("researcher"));
        expect(tooltip()?.textContent).toBe("1run in 24hIdle");
        expect((tooltip()?.querySelector("span") as HTMLElement).style.background).toBe("var(--chart-context)");
        expect((tooltip() as HTMLElement).style.right).not.toBe("");
        expect(link("planner").className).not.toContain("opacity-35");
        expect(link("writer").className).not.toContain("opacity-35");
    });

    it("reads out an idle agent with no runs, and clears on blur", () => {
        const { tooltip, announced, link } = renderField();
        fireEvent.focus(link("writer"));
        expect(tooltip()?.textContent).toBe("0runs in 24hIdle");
        expect(announced()).toBe("writer: 0 runs in 24 hours");
        fireEvent.blur(link("writer"));
        expect(tooltip()).toBeNull();
    });

    it("drops a stale agent readout and undims the graph when that agent leaves", () => {
        const { groups, tooltip, announced, rerender, link } = renderField();
        fireEvent.mouseEnter(link("archivist"));
        rerender(<GraphField nodes={NODES.slice(0, 3)} edges={EDGES} summary="Three agents." />);
        expect(tooltip()).toBeNull();
        expect(announced()).toBe("");
        expect(groups().map((group) => group.getAttribute("opacity"))).toEqual(["1", "1", "1"]);
        for (const node of NODES.slice(0, 3)) expect(link(node.name).className).not.toContain("opacity-35");
    });
});

describe("GraphField senders off the roster", () => {
    // A message no record vouched for, from a sender with no events
    const vouchless = agentEdge("unknown", "writer", { messages: 3, total: 3, untrusted: 3, untrustedShare: 1 });

    it("draws the sender as a node with no link, and its line", () => {
        const { groups, link } = renderField(NODES, [...EDGES, vouchless]);
        const items = [...screen.getByRole("list", { name: "Agents" }).children];
        expect(items).toHaveLength(5);
        const outside = items.find((item) => item.textContent === "unknown");
        expect(outside?.querySelector("a")).toBeNull();
        expect(groups()).toHaveLength(4);
        fireEvent.mouseEnter(groups()[3].lastElementChild as Element);
        expect(outside?.className).not.toContain("opacity-35");
        expect(link("planner").className).toContain("opacity-35");
        fireEvent.mouseLeave(groups()[3].lastElementChild as Element);
        fireEvent.mouseEnter(link("planner"));
        expect(outside?.className).toContain("opacity-35");
    });
});
