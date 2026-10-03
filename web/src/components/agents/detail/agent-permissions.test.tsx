import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentEdge } from "@/lib/data/agents";
import { detail, edge } from "../../../../test/agents-lib-detail/fixtures";
import { AgentPermissions } from "./agent-permissions";

function page(links: AgentEdge[], tools = ["search", "delegate"]) {
    const base = detail({ links });
    return { ...base, agent: { ...base.agent, tools } };
}

// The block under a heading, such as "Delegates to"
function block(title: string) {
    return screen.getByRole("heading", { level: 3, name: title }).parentElement as HTMLElement;
}

function lines(title: string) {
    return within(block(title))
        .getAllByRole("listitem")
        .map((item) => item.textContent);
}

const links = [
    edge("researcher", "billing", { delegations: 3, handoffs: 1, untrustedShare: 0.05 }),
    edge("researcher", "support", { delegations: 12, untrustedShare: 0.7 }),
    edge("orchestrator", "researcher", { delegations: 1, handoffs: 2, untrustedShare: 0.2 }),
    edge("support", "researcher", { handoffs: 5 }),
];

describe("AgentPermissions", () => {
    it("shows the tools the agent holds over the last 30 days", () => {
        render(<AgentPermissions detail={page(links)} />);
        const pane = screen.getByRole("region", { name: "Permissions" });
        expect(within(pane).getByText("30D")).toBeTruthy();
        expect(lines("Tools")).toEqual(["search", "delegate"]);
    });

    it("lists who it delegates to, busiest first, with the untrusted share", () => {
        render(<AgentPermissions detail={page(links)} />);
        expect(lines("Delegates to")).toEqual([
            "support12 delegations · 70% untrusted",
            "billing3 delegations · 5% untrusted",
        ]);
        const first = within(block("Delegates to")).getByRole("link", { name: "support" });
        expect(first.getAttribute("href")).toBe("/agents/support");
    });

    it("warns about a link that mostly carried untrusted content", () => {
        render(<AgentPermissions detail={page(links)} />);
        expect(screen.getByText("70%").parentElement?.className).toBe("text-caution-text");
        expect(within(block("Works for")).getByText("20%").parentElement?.className).toBe("");
    });

    it("lists who it works for, using the single word for one delegation", () => {
        render(<AgentPermissions detail={page(links)} />);
        expect(lines("Works for")).toEqual(["orchestrator1 delegation · 20% untrusted"]);
    });

    it("splits handoffs out and in with a gap between them", () => {
        render(<AgentPermissions detail={page(links)} />);
        expect(lines("Handoffs")).toEqual([
            "billing1 handoff out · 5% untrusted",
            "support5 handoffs in · 0% untrusted",
            "orchestrator2 handoffs in · 20% untrusted",
        ]);
        expect(block("Handoffs").children).toHaveLength(4);
    });

    it("drops the gap when handoffs only go one way", () => {
        const { rerender } = render(<AgentPermissions detail={page([links[0]])} />);
        expect(lines("Handoffs")).toEqual(["billing1 handoff out · 5% untrusted"]);
        expect(block("Handoffs").children).toHaveLength(3);
        rerender(<AgentPermissions detail={page([links[3]])} />);
        expect(lines("Handoffs")).toEqual(["support5 handoffs in · 0% untrusted"]);
        expect(block("Handoffs").children).toHaveLength(3);
    });

    it("says none for an agent with the delegate tool and no links", () => {
        render(<AgentPermissions detail={page([])} />);
        expect(block("Delegates to").textContent).toBe("Delegates toNone");
        expect(block("Works for").textContent).toBe("Works forNone · starts its own runs");
        expect(screen.queryByRole("heading", { name: "Handoffs" })).toBeNull();
    });

    it("explains that an agent without the delegate tool cannot delegate", () => {
        render(<AgentPermissions detail={page([], ["search"])} />);
        expect(block("Delegates to").textContent).toBe("Delegates toNone · no delegate tool");
    });

    it("leaves out links that carried only messages", () => {
        render(<AgentPermissions detail={page([edge("researcher", "billing", { messages: 40 })])} />);
        expect(block("Delegates to").textContent).toBe("Delegates toNone");
        expect(screen.queryByRole("heading", { name: "Handoffs" })).toBeNull();
    });
});
