import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { LINKS, POINTS, emptyFleet } from "../../../test/summary/fleet";
import { AgentPanes } from "./agent-panes";

function pane(name: string) {
    return within(screen.getByRole("region", { name }));
}

// Flips a chart to its table view and reads the ranked names
function rankedNames(name: string): string[] {
    fireEvent.click(pane(name).getByRole("button", { name: "Table" }));
    return pane(name)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent ?? "");
}

// The tile grid sits under the heading
function grid() {
    return screen.getByRole("region", { name: "Agents and links" }).lastElementChild?.className.split(" ") ?? [];
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("AgentPanes", () => {
    it("ranks entry points by count, then by name, leaving out agents with none", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: POINTS, untrustedLinks: LINKS })} />);

        expect(grid()).toContain("grid-cols-2");
        expect(rankedNames("Entry points")).toEqual(["researcher", "billing", "support"]);
        expect(rankedNames("Turning points")).toEqual(["billing"]);
        expect(pane("Turning points").getByRole("table").querySelector("caption")?.textContent).toBe(
            "Agents where an incident turned harmful over the last 30 days. billing leads with 1 incidents, out of 1.",
        );
    });

    it("lists each untrusted link with its delegations and share", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: POINTS, untrustedLinks: LINKS })} />);
        const headers = pane("Untrusted links")
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent);
        const rows = pane("Untrusted links").getAllByRole("row").slice(1);

        expect(headers).toEqual(["Link", "Untrusted", "Delegations", "Untrusted share"]);
        expect(rows).toHaveLength(2);
        expect(
            within(rows[0])
                .getAllByRole("cell")
                .map((cell) => cell.textContent),
        ).toEqual(["researchertobilling", "1,200", "2,400", "50%"]);
        expect(within(rows[1]).getByRole("progressbar").getAttribute("aria-label")).toBe(
            "8% of delegations from support to billing carried untrusted content",
        );
    });

    it("shows only the links table when no agent was an entry or turning point", () => {
        render(<AgentPanes fleet={emptyFleet({ untrustedLinks: LINKS })} />);

        expect(screen.queryByRole("region", { name: "Entry points" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Turning points" })).toBeNull();
        expect(screen.queryAllByRole("img")).toHaveLength(0);
        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(3);
    });

    it("keeps links apart when agent names contain hyphens", () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const [first, second] = LINKS;
        const links = [
            { ...first, from: "support-bot", to: "billing" },
            { ...second, from: "support", to: "bot-billing" },
        ];
        render(<AgentPanes fleet={emptyFleet({ untrustedLinks: links })} />);
        const warnings = [...errors.mock.calls];
        errors.mockRestore();

        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(3);
        expect(warnings).toEqual([]);
    });

    it("draws only the entry points, full width, when nothing else has data", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: [{ agent: "support", entry: 2, turning: 0 }] })} />);

        expect(grid()).not.toContain("grid-cols-2");
        expect(screen.queryByRole("region", { name: "Turning points" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Untrusted links" })).toBeNull();
        expect(rankedNames("Entry points")).toEqual(["support"]);
    });

    it("shows one line and no charts or tables when there is nothing to show", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: [{ agent: "planner", entry: 0, turning: 0 }] })} />);
        const section = screen.getByRole("region", { name: "Agents and links" });

        expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Agents and links");
        expect(within(section).getByRole("status").textContent).toBe("No untrusted links in the last 30 days");
        expectNoChartsOrTables(section);
    });

    it("waits with loading link rows and no charts before the summary arrives", () => {
        render(<AgentPanes fleet={null} />);

        expect(pane("Untrusted links").getByRole("status").textContent).toBe("Loading links…");
        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(5);
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.queryByRole("region", { name: "Entry points" })).toBeNull();
    });
});
