import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { expectEmptyChart, expectEmptyTable } from "../../../test/summary/frames";
import { LINKS, POINTS, emptyFleet } from "../../../test/summary/fleet";
import { AgentPanes } from "./agent-panes";

const HEADERS = ["Link", "Untrusted", "Delegations", "Untrusted share"];
const NO_LINKS = "No agent-to-agent link carried untrusted content";

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
            "Agents where an incident turned harmful over the last 30 days. billing leads with 1 incident, out of 1.",
        );
    });

    it("lists each untrusted link with its delegations and share", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: POINTS, untrustedLinks: LINKS })} />);
        const headers = pane("Untrusted links")
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent);
        const rows = pane("Untrusted links").getAllByRole("row").slice(1);

        expect(headers).toEqual(HEADERS);
        expect(rows).toHaveLength(2);
        expect(
            within(rows[0])
                .getAllByRole("cell")
                .map((cell) => cell.textContent),
        ).toEqual(["researchertobilling", "1,200", "2,400", "50%"]);
        expect(within(rows[1]).getByRole("progressbar").getAttribute("aria-label")).toBe(
            "8% of delegations from support to billing carried untrusted content",
        );
        expect(pane("Untrusted links").queryByRole("status")).toBeNull();
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

    it("keeps both charts unlit beside the links when no agent was an entry or turning point", () => {
        render(<AgentPanes fleet={emptyFleet({ untrustedLinks: LINKS })} />);

        expect(grid()).toContain("grid-cols-2");
        expectEmptyChart("Entry points", "No agent was an entry point");
        expectEmptyChart("Turning points", "No agent was a turning point");
        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(3);
    });

    it("keeps every pane, and the links table's header over one quiet line, when there is nothing to show", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: [{ agent: "planner", entry: 0, turning: 0 }] })} />);

        expectEmptyChart("Entry points", "No agent was an entry point");
        expectEmptyChart("Turning points", "No agent was a turning point");
        expectEmptyTable(screen.getByRole("region", { name: "Untrusted links" }), HEADERS, NO_LINKS);
        // The grid's edge already closes the pane under the quiet line
        expect(pane("Untrusted links").getByRole("status").parentElement?.className).toContain(
            "[&>[role=status]]:border-b-0",
        );
    });

    it("draws the turning points while the entry points stay unlit", () => {
        render(<AgentPanes fleet={emptyFleet({ agentPoints: [{ agent: "billing", entry: 0, turning: 2 }] })} />);

        expectEmptyChart("Entry points", "No agent was an entry point");
        expect(rankedNames("Turning points")).toEqual(["billing"]);
    });

    it("shows loading charts and loading link rows before the summary arrives", () => {
        render(<AgentPanes fleet={null} />);

        expect(pane("Entry points").getByRole("img").getAttribute("aria-label")).toBe("Entry points, loading");
        expect(pane("Turning points").getByRole("img").getAttribute("aria-label")).toBe("Turning points, loading");
        expect(pane("Untrusted links").getByRole("status").textContent).toBe("Loading links…");
        expect(pane("Untrusted links").getAllByRole("row")).toHaveLength(5);
        expect(screen.queryByText(NO_LINKS)).toBeNull();
    });
});
