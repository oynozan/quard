import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { node } from "../../../../test/agents-lib-detail/fixtures";
import { AgentRoster } from "./agent-roster";

describe("AgentRoster", () => {
    it("lists running agents first, then idle, then offline, busiest first within each", () => {
        const agents = [
            node("deploy-bot", { state: "offline", runs24h: 900 }),
            node("support", { state: "idle", runs24h: 12 }),
            node("billing", { state: "running", runs24h: 40 }),
            node("researcher", { state: "running", runs24h: 1520 }),
        ];
        render(<AgentRoster agents={agents} />);
        const names = screen.getAllByRole("link").map((link) => link.textContent);
        expect(names).toEqual([
            "researcher, Running1,520 runs 24h",
            "billing, Running40 runs 24h",
            "support, Idle12 runs 24h",
            "deploy-bot, Offline900 runs 24h",
        ]);
    });

    it("opens each agent's page, with the name escaped for the URL", () => {
        render(<AgentRoster agents={[node("inbox triage/v2")]} />);
        expect(screen.getByRole("link").getAttribute("href")).toBe("/agents/inbox%20triage%2Fv2");
    });

    it("shows the agent count in the pane header", () => {
        render(<AgentRoster agents={[node("a"), node("b")]} />);
        const pane = screen.getByRole("region", { name: "Agents" });
        expect(within(pane).getByText("2")).toBeTruthy();
    });

    it("dims the name of an offline agent", () => {
        render(<AgentRoster agents={[node("on"), node("off", { state: "offline" })]} />);
        const [on, off] = screen.getAllByRole("link").map((link) => link.children[1]);
        expect(on.classList.contains("text-ink")).toBe(true);
        expect(off.classList.contains("text-ink-subtle")).toBe(true);
        expect(off.classList.contains("text-ink")).toBe(false);
    });

    it("says there are no agents yet when the list is empty", () => {
        render(<AgentRoster agents={[]} />);
        expect(screen.getByRole("status").textContent).toBe("No agents yet");
        expect(screen.queryByRole("list")).toBeNull();
        expect(within(screen.getByRole("region", { name: "Agents" })).getByText("0")).toBeTruthy();
    });
});
