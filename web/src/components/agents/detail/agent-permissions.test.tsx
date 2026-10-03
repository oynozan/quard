import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentEdge } from "@/lib/data/agents";
import { edge } from "../../../../test/agents-lib-detail/fixtures";
import { AgentPermissions } from "./agent-permissions";

function renderFor(links: AgentEdge[]) {
    return render(<AgentPermissions name="researcher" links={links} />);
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
    it("covers the last 30 days, with no tools block while held tools are not recorded", () => {
        renderFor(links);
        const pane = screen.getByRole("region", { name: "Permissions" });
        expect(within(pane).getByText("30D")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
    });

    it("lists who it delegates to, busiest first, with the untrusted share", () => {
        renderFor(links);
        expect(lines("Delegates to")).toEqual([
            "support12 delegations · 70% untrusted",
            "billing3 delegations · 5% untrusted",
        ]);
        const first = within(block("Delegates to")).getByRole("link", { name: "support" });
        expect(first.getAttribute("href")).toBe("/agents/support");
    });

    it("warns about a link that mostly carried untrusted content", () => {
        renderFor(links);
        expect(screen.getByText("70%").parentElement?.className).toBe("text-caution-text");
        expect(within(block("Works for")).getByText("20%").parentElement?.className).toBe("");
    });

    it("lists who it works for, using the single word for one delegation", () => {
        renderFor(links);
        expect(lines("Works for")).toEqual(["orchestrator1 delegation · 20% untrusted"]);
    });

    it("splits handoffs out and in with a gap between them", () => {
        renderFor(links);
        expect(lines("Handoffs")).toEqual([
            "billing1 handoff out · 5% untrusted",
            "support5 handoffs in · 0% untrusted",
            "orchestrator2 handoffs in · 20% untrusted",
        ]);
        expect(block("Handoffs").children).toHaveLength(4);
    });

    it("drops the gap when handoffs only go one way, even with no delegations", () => {
        const { rerender } = renderFor([edge("researcher", "billing", { handoffs: 1, untrustedShare: 0.05 })]);
        expect(lines("Handoffs")).toEqual(["billing1 handoff out · 5% untrusted"]);
        expect(block("Handoffs").children).toHaveLength(3);
        rerender(<AgentPermissions name="researcher" links={[links[3]]} />);
        expect(lines("Handoffs")).toEqual(["support5 handoffs in · 0% untrusted"]);
        expect(block("Handoffs").children).toHaveLength(3);
    });

    it("says none on a side with no delegations, and hides handoffs", () => {
        const { rerender } = renderFor([edge("researcher", "support", { delegations: 2 })]);
        expect(block("Works for").textContent).toBe("Works forNone · starts its own runs");
        expect(screen.queryByRole("heading", { name: "Handoffs" })).toBeNull();
        rerender(
            <AgentPermissions name="researcher" links={[edge("orchestrator", "researcher", { delegations: 1 })]} />,
        );
        expect(block("Delegates to").textContent).toBe("Delegates toNone");
        expect(lines("Works for")).toEqual(["orchestrator1 delegation · 0% untrusted"]);
    });

    it("keeps the tag and both blocks for an agent with no links, saying none on each side", () => {
        renderFor([]);
        const pane = screen.getByRole("region", { name: "Permissions" });
        expect(within(pane).getByText("30D")).toBeTruthy();
        expect(block("Delegates to").textContent).toBe("Delegates toNone");
        expect(block("Works for").textContent).toBe("Works forNone · starts its own runs");
        expect(screen.queryByRole("heading", { name: "Handoffs" })).toBeNull();
    });

    it("leaves out links that carried only messages", () => {
        renderFor([edge("researcher", "billing", { messages: 40 })]);
        expect(block("Delegates to").textContent).toBe("Delegates toNone");
        expect(block("Works for").textContent).toBe("Works forNone · starts its own runs");
        expect(screen.queryByRole("heading", { name: "Handoffs" })).toBeNull();
    });
});
