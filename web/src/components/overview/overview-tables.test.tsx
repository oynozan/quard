import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { APPROVALS, INCIDENTS, runRow } from "../../../test/overview/fixtures";
import { HOUR, NOW } from "../../../test/time";
import { ApprovalsSection, IncidentsSection, RunsSection } from "./overview-tables";

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function cellsOf(row: HTMLElement) {
    return within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
}

// A section with no rows shows its title and one line, with no chip, link or table
function expectEmptySection(container: HTMLElement, title: string, line: string) {
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title);
    expect(screen.getByRole("status").textContent).toBe(line);
    expect(screen.queryByRole("link")).toBeNull();
    expectNoChartsOrTables(container);
}

describe("ApprovalsSection", () => {
    it("counts the waiting approvals and links to the approvals page", () => {
        render(<ApprovalsSection approvals={APPROVALS} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting2");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/approvals");
        expect(bodyRows()).toHaveLength(2);
    });

    it("links each row to its card and shows the first untrusted origin", () => {
        render(<ApprovalsSection approvals={APPROVALS} now={NOW} />);

        const link = screen.getByRole("link", { name: "Review pay_invoice by billing" });
        expect(link.getAttribute("href")).toBe("/approvals#apr_7f31");
        expect(cellsOf(bodyRows()[0])).toEqual([
            "pay_invoicebilling · run 4bf92f35",
            "web:supplier-portal.exampleuntrusted",
            "4 min",
            "Review",
        ]);
    });

    it("says when only trusted sources fed a call and when a call no longer waits", () => {
        render(<ApprovalsSection approvals={APPROVALS} now={NOW} />);
        const deploy = cellsOf(bodyRows()[1]);

        expect(deploy[1]).toBe("Trusted sources only");
        expect(deploy[2]).toBe("No longer waiting");
    });

    it("shows only its title and one line when nothing is waiting", () => {
        const { container } = render(<ApprovalsSection approvals={[]} now={NOW} />);

        expectEmptySection(container, "Approvals waiting", "No approvals waiting");
    });
});

describe("RunsSection", () => {
    it("lists recent runs with their status, cost and age, linked to each run", () => {
        const runs = [runRow({ id: "e0179a01".padEnd(32, "0") }), runRow()];
        render(<RunsSection runs={runs} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Recent runs2");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/runs");
        const row = bodyRows()[1];
        const [name, statusCell, , cost, started] = cellsOf(row);
        expect(name).toBe("orchestrator64da1210 · 2 agents · 14 steps");
        expect(statusCell).toBe("Running");
        expect(cost).toBe("$0.03");
        expect(started).toBe("1 min ago");
        expect(within(row).getByRole("link").getAttribute("href")).toBe(`/runs/${runs[1].id}`);
    });

    it("uses the singular for one agent and one step", () => {
        render(<RunsSection runs={[runRow({ rootAgent: "billing", agents: ["billing"], steps: 1 })]} now={NOW} />);

        expect(cellsOf(bodyRows()[0])[0]).toBe("billing64da1210 · 1 agent · 1 step");
    });

    it("shows a dash when a model's price is unknown", () => {
        render(<RunsSection runs={[runRow({ costKnown: false })]} now={NOW} />);

        expect(cellsOf(bodyRows()[0])[3]).toBe("—");
    });

    it("draws the guard decisions of each run", () => {
        render(<RunsSection runs={[runRow({ startedAt: NOW - 3 * HOUR })]} now={NOW} />);
        const bar = within(bodyRows()[0]).getAllByRole("cell")[2];

        expect(within(bar).getByRole("img", { name: "5 allowed, 0 asked, 1 blocked" })).toBeTruthy();
        expect(cellsOf(bodyRows()[0])[4]).toBe("3 h ago");
    });

    it("says a run has no guard decisions yet instead of drawing an empty bar", () => {
        render(<RunsSection runs={[runRow({ decisions: { allowed: 0, asked: 0, blocked: 0 } })]} now={NOW} />);
        const cell = within(bodyRows()[0]).getAllByRole("cell")[2];

        expect(cell.textContent).toBe("None yet");
        expect(within(cell).queryByRole("img")).toBeNull();
        expect(within(cell).getByText("None yet").className).toContain("text-ink-absent");
    });

    it("shows only its title and one line before the first run", () => {
        const { container } = render(<RunsSection runs={[]} now={NOW} />);

        expectEmptySection(container, "Recent runs", "No runs yet");
    });
});

describe("IncidentsSection", () => {
    it("lists incidents with their cause, replay state and age", () => {
        render(<IncidentsSection incidents={INCIDENTS} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Incidents2");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/incidents");
        const rows = bodyRows();
        expect(cellsOf(rows[0])).toEqual([
            "Payment to an IBAN copied from a supplier pageresearcher → billing · fetch_page · supplier-portal.example",
            "bad input",
            "Replaying",
            "3 min ago",
        ]);
        expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/incidents/inc_118");
    });

    it("shows a finished replay by its own word", () => {
        render(<IncidentsSection incidents={INCIDENTS} now={NOW} />);

        expect(bodyRows().map((row) => cellsOf(row)[2])).toEqual(["Replaying", "confirmed"]);
    });

    it("shows only its title and one line before the first incident", () => {
        const { container } = render(<IncidentsSection incidents={[]} now={NOW} />);

        expectEmptySection(container, "Incidents", "No incidents yet");
    });
});
