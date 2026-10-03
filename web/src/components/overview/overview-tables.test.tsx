import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getOverview } from "@/lib/data/overview";
import { NOW } from "@/lib/data/rng";
import type { RunSummary } from "@/lib/data/types";
import { ApprovalsSection, IncidentsSection, RunsSection } from "./overview-tables";

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function cellsOf(row: HTMLElement) {
    return within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
}

describe("ApprovalsSection", () => {
    it("counts the waiting approvals and links to the approvals page", async () => {
        const { approvals } = await getOverview();
        render(<ApprovalsSection approvals={approvals} now={NOW} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting4");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/approvals");
        expect(bodyRows()).toHaveLength(4);
    });

    it("links each row to its card and shows the first untrusted origin", async () => {
        const { approvals } = await getOverview();
        render(<ApprovalsSection approvals={approvals} now={NOW} />);
        const links = screen.getAllByRole("link", { name: "Review pay_invoice by billing" });
        expect(links.map((link) => link.getAttribute("href"))).toEqual(["/approvals#apr_7f31", "/approvals#apr_7f0a"]);
        expect(cellsOf(bodyRows()[0])).toEqual([
            "pay_invoicebilling · run 4bf92f35",
            "web:supplier-portal.exampleuntrusted",
            "4 min",
            "Review",
        ]);
    });

    it("says when only trusted sources fed a call and when a call no longer waits", async () => {
        const { approvals } = await getOverview();
        render(<ApprovalsSection approvals={approvals} now={NOW} />);
        const [, , deploy, payment] = bodyRows().map(cellsOf);
        expect(deploy[1]).toBe("Trusted sources only");
        expect(deploy[2]).toBe("No longer waiting");
        expect(payment[1]).toBe("Trusted sources only");
    });

    it("says nothing is waiting", () => {
        render(<ApprovalsSection approvals={[]} now={NOW} />);
        expect(screen.getByRole("status").textContent).toBe("No approvals waiting");
        expect(bodyRows()).toHaveLength(0);
    });
});

describe("RunsSection", () => {
    it("lists recent runs with their status, cost and age, linked to each run", async () => {
        const { runs } = await getOverview();
        render(<RunsSection runs={runs} now={NOW} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Recent runs6");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/runs");
        const row = bodyRows()[1];
        const [name, statusCell, , cost, started] = cellsOf(row);
        expect(name).toBe("orchestrator64da1210 · 2 agents · 14 steps");
        expect(statusCell).toBe("Running");
        expect(cost).toBe("$0.03");
        expect(started).toBe("1 min ago");
        expect(within(row).getByRole("link").getAttribute("href")).toBe(`/runs/${runs[1].id}`);
    });

    it("uses the singular for one agent and one step", async () => {
        const { runs } = await getOverview();
        render(<RunsSection runs={runs.slice(0, 1)} now={NOW} />);
        expect(cellsOf(bodyRows()[0])[0]).toBe("billinge0179a01 · 1 agent · 1 step");
    });

    it("shows a dash when a model's price is unknown", async () => {
        const { runs } = await getOverview();
        const unpriced: RunSummary = { ...runs[0], costKnown: false };
        render(<RunsSection runs={[unpriced]} now={NOW} />);
        expect(cellsOf(bodyRows()[0])[3]).toBe("—");
    });

    it("draws the guard decisions of each run", async () => {
        const { runs } = await getOverview();
        render(<RunsSection runs={runs.slice(3, 4)} now={NOW} />);
        const bar = within(bodyRows()[0]).getAllByRole("cell")[2];
        expect(within(bar).getByRole("img", { name: "5 allowed, 0 asked, 1 blocked" })).toBeTruthy();
    });
});

describe("IncidentsSection", () => {
    it("lists incidents with their cause, replay state and age", async () => {
        const { incidents } = await getOverview();
        render(<IncidentsSection incidents={incidents} now={NOW} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Incidents4");
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

    it("shows a finished replay by its own word", async () => {
        const { incidents } = await getOverview();
        render(<IncidentsSection incidents={incidents} now={NOW} />);
        const replays = bodyRows().map((row) => cellsOf(row)[2]);
        expect(replays).toEqual(["Replaying", "confirmed", "confirmed", "not confirmed"]);
    });
});
