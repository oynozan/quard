import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HOUR, NOW } from "@/lib/data/rng";
import { detail } from "../../../../test/agents-lib-detail/fixtures";
import { AgentHeading } from "./agent-heading";

describe("AgentHeading", () => {
    it("leads back to the agent list in a breadcrumb", () => {
        render(<AgentHeading detail={detail()} now={NOW} />);
        const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(crumbs).getByRole("link", { name: "Agents" }).getAttribute("href")).toBe("/agents");
        expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("researcher");
    });

    it("titles the page with the agent name and shows its state", () => {
        render(<AgentHeading detail={detail()} now={NOW} />);
        const title = screen.getByRole("heading", { level: 1, name: "researcher" });
        expect(title.nextElementSibling?.textContent).toBe("Running");
    });

    it("lists the version, model, app, short rules hash and when the app was last seen", () => {
        const page = detail();
        page.app.lastSeenAt = NOW - 3 * HOUR;
        render(<AgentHeading detail={page} now={NOW} />);
        const line = screen.getByText("v3").parentElement;
        expect(line?.textContent).toBe("v3·claude-sonnet·app support-app·rules 0123456789ab·seen 3 h ago");
        expect(screen.getByTitle("Rules 0123456789abcdef0123").textContent).toBe("rules 0123456789ab");
    });

    it("warns when the agent's app is offline", () => {
        const page = detail();
        page.app.state = "offline";
        page.agent.state = "offline";
        render(<AgentHeading detail={page} now={NOW} />);
        expect(screen.getByText("support-app").parentElement?.textContent).toBe("app support-app offline");
        expect(screen.getByText("Offline")).toBeTruthy();
    });

    it("links to the agent's runs, with the name escaped for the URL", () => {
        const page = detail();
        page.agent.name = "inbox triage";
        render(<AgentHeading detail={page} now={NOW} />);
        expect(screen.getByRole("link", { name: "View runs" }).getAttribute("href")).toBe("/runs?agent=inbox%20triage");
    });
});
