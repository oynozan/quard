import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { START, makeAgent, makeEdge } from "../../../../test/runs-detail-list/fixtures";
import { RunGraph } from "./run-graph";

const root = makeAgent({ name: "billing", version: "2.1.0", steps: 7, costUsd: 0.0062 });
const child = makeAgent({
    name: "research bot",
    parent: "billing",
    model: "gpt-5.4-nano",
    steps: 3,
    costUsd: 0,
    costKnown: false,
    influenced: true,
});
const delegation = makeEdge({ to: "research bot", at: START + 9200, untrusted: true });

function agentRows() {
    return within(screen.getByRole("list", { name: "Agents by delegation" })).getAllByRole("listitem");
}

describe("RunGraph", () => {
    it("draws the orchestrator with its delegated agent nested under it", () => {
        render(<RunGraph graph={{ nodes: [root, child], edges: [delegation] }} startedAt={START} />);
        expect(screen.getByRole("region", { name: "Run graph" })).toBeTruthy();

        const [top, nested] = agentRows();
        expect(within(top).getByRole("list").contains(nested)).toBe(true);
        expect(screen.getByRole("link", { name: "billing" }).getAttribute("href")).toBe("/agents/billing");
        expect(screen.getByRole("link", { name: "research bot" }).getAttribute("href")).toBe("/agents/research%20bot");
        // The messages sit under the agents, folded behind their count.
        expect(screen.getByRole("button", { name: "1 message" }).getAttribute("aria-expanded")).toBe("false");
    });

    it("shows each agent's version, model, steps and cost, with a dash for an unknown price", () => {
        render(<RunGraph graph={{ nodes: [root, child], edges: [delegation] }} startedAt={START} />);
        const [top, nested] = agentRows();
        expect(screen.getByRole("link", { name: "billing" }).parentElement!.children).toHaveLength(3);
        expect(top.textContent).toContain("billing2.1.0gpt-5.4-mini7 steps$0.0062");
        expect(nested.textContent).toContain("research bot1.0.0gpt-5.4-nano3 steps—untrusted");
    });

    it("labels how a delegated agent was reached, flagging untrusted content", () => {
        render(<RunGraph graph={{ nodes: [root, child], edges: [delegation] }} startedAt={START} />);
        const note = screen.getByTitle("Delegation from billing over in-process");
        expect(note.textContent).toBe("Delegation · 9.2 suntrusted");
    });

    it("leaves out the untrusted chip for a trusted handoff", () => {
        const handoff = makeEdge({ kind: "handoff", to: "research bot", untrusted: false });
        const trusted = { ...child, influenced: false };
        render(<RunGraph graph={{ nodes: [root, trusted], edges: [handoff] }} startedAt={START} />);
        expect(screen.getByTitle("Handoff from billing over in-process").textContent).toBe("Handoff · 1.5 s");
        expect(screen.queryByText("untrusted")).toBeNull();
    });

    it("leaves out a version and a model that are not known", () => {
        const bare = makeAgent({ name: "billing", version: "", model: "" });
        render(<RunGraph graph={{ nodes: [bare], edges: [] }} startedAt={START} />);
        expect(screen.getByRole("link", { name: "billing" }).parentElement!.children).toHaveLength(1);
        expect(agentRows()[0]!.textContent).toBe("billing0 steps$0.00");
    });

    it("shows a lone agent with no incoming message and no messages below", () => {
        render(<RunGraph graph={{ nodes: [root], edges: [] }} startedAt={START} />);
        expect(agentRows()).toHaveLength(1);
        expect(screen.queryByTitle(/from/)).toBeNull();
        expect(screen.getByText("No messages")).toBeTruthy();
    });

    it("lists every agent when their parents form a loop", () => {
        const looped = [
            makeAgent({ name: "planner", parent: "writer" }),
            makeAgent({ name: "writer", parent: "planner" }),
        ];
        render(<RunGraph graph={{ nodes: looped, edges: [] }} startedAt={START} />);
        const links = within(screen.getByRole("list", { name: "Agents by delegation" })).queryAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(["planner", "writer"]);
    });

    it("labels an agent only with the message from its own parent", () => {
        const sideways = makeEdge({ kind: "message", from: "writer", to: "research bot" });
        render(<RunGraph graph={{ nodes: [root, child], edges: [sideways] }} startedAt={START} />);
        expect(screen.queryByTitle(/from/)).toBeNull();
        expect(screen.getByRole("button", { name: "1 message" })).toBeTruthy();
    });
});
