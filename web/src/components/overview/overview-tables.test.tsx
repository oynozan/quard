import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

// A section with no rows keeps its zero count, link and header row, with one quiet line under it
function expectEmptyTable(title: string, href: string, headers: string[], line: string) {
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(`${title}0`);
    expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe(href);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(headers);
    expect(bodyRows()).toHaveLength(0);
    const quiet = screen.getByRole("status");
    expect(quiet.textContent).toBe(line);
    expect(quiet.previousElementSibling?.querySelector("table")).toBe(screen.getByRole("table"));
}

describe("ApprovalsSection", () => {
    it("counts the waiting approvals and links to the approvals page", () => {
        render(<ApprovalsSection approvals={APPROVALS} total={2} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting2");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/approvals");
        expect(bodyRows()).toHaveLength(2);
    });

    it("links each row to its card and shows the first untrusted origin", () => {
        render(<ApprovalsSection approvals={APPROVALS} total={2} now={NOW} />);

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
        render(<ApprovalsSection approvals={APPROVALS} total={2} now={NOW} />);
        const deploy = cellsOf(bodyRows()[1]);

        expect(deploy[1]).toBe("Trusted sources only");
        expect(deploy[2]).toBe("No longer waiting");
    });

    it("lists the first five, still-waiting calls first, and counts every open request", () => {
        const [waiting, stopped] = APPROVALS;
        const many = Array.from({ length: 7 }, (_, n) => ({
            ...(n < 2 ? stopped : waiting),
            id: `apr_${n}`,
            tool: `tool_${n}`,
        }));
        render(<ApprovalsSection approvals={many} total={120} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting120");
        expect(bodyRows().map((row) => cellsOf(row)[0]?.split("billing")[0].split("deploy-bot")[0])).toEqual([
            "tool_2",
            "tool_3",
            "tool_4",
            "tool_5",
            "tool_6",
        ]);
    });

    it("never counts fewer requests than it lists", () => {
        render(<ApprovalsSection approvals={APPROVALS} total={0} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting2");
    });

    it("keeps its table header and says nothing is waiting", () => {
        render(<ApprovalsSection approvals={[]} total={0} now={NOW} />);

        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting0");
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
            "Call",
            "Influenced by",
            "Waiting",
            "Actions",
        ]);
        expect(screen.getByRole("status").textContent).toBe("No approvals waiting");
        expect(bodyRows()).toHaveLength(0);
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

    it("keeps its header row with one quiet line before the first run", () => {
        render(<RunsSection runs={[]} now={NOW} />);

        expectEmptyTable(
            "Recent runs",
            "/runs",
            ["Run", "Status", "Guard decisions", "Cost", "Started"],
            "No runs yet",
        );
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

    it("names the run and leaves the cause blank while the finder works", () => {
        const finding = {
            ...INCIDENTS[0],
            title: "Finding the root cause",
            category: null,
            entryPoint: null,
            damage: null,
            entryAgent: null,
            damageAgent: null,
        };
        render(<IncidentsSection incidents={[finding]} now={NOW} />);

        const [name, cause] = cellsOf(bodyRows()[0]);
        expect(name).toBe(`Finding the root causeRun ${finding.runId.slice(0, 8)}`);
        expect(cause).toBe("—");
    });

    it("keeps its header row with one quiet line before the first incident", () => {
        render(<IncidentsSection incidents={[]} now={NOW} />);

        expectEmptyTable("Incidents", "/incidents", ["Incident", "Cause", "Replay", "Opened"], "No incidents yet");
    });
});
