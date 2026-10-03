import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { node } from "../../../../test/agents-lib-detail/fixtures";
import { HOUR, NOW } from "../../../../test/time";
import { AgentHeading } from "./agent-heading";

const researcher = node("researcher", { lastSeenAt: NOW - 3 * HOUR });

describe("AgentHeading", () => {
    it("leads back to the agent list in a breadcrumb", () => {
        render(<AgentHeading agent={researcher} now={NOW} />);
        const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(crumbs).getByRole("link", { name: "Agents" }).getAttribute("href")).toBe("/agents");
        expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("researcher");
    });

    it("titles the page with the agent name and shows its state", () => {
        const { rerender } = render(<AgentHeading agent={researcher} now={NOW} />);
        const title = screen.getByRole("heading", { level: 1, name: "researcher" });
        expect(title.nextElementSibling?.textContent).toBe("Running");
        rerender(<AgentHeading agent={{ ...researcher, state: "idle" }} now={NOW} />);
        expect(title.nextElementSibling?.textContent).toBe("Idle");
    });

    it("shows the model and when the agent was last heard from", () => {
        render(<AgentHeading agent={researcher} now={NOW} />);
        const line = screen.getByText("claude-sonnet").parentElement;
        expect(line?.textContent).toBe("claude-sonnet·seen 3 h ago");
    });

    it("shows only when it was last heard from for an agent with no model calls", () => {
        render(<AgentHeading agent={{ ...researcher, model: null }} now={NOW} />);
        const line = screen.getByText("3 h").closest("p");
        expect(line?.textContent).toBe("seen 3 h ago");
    });

    it("links to the agent's runs, with the name escaped for the URL", () => {
        render(<AgentHeading agent={{ ...researcher, name: "inbox triage" }} now={NOW} />);
        expect(screen.getByRole("link", { name: "View runs" }).getAttribute("href")).toBe("/runs?agent=inbox%20triage");
    });
});
