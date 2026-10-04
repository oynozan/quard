import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RUN_ID, START, makeRow } from "../../../../test/runs-detail-list/fixtures";
import { RunsTable } from "./runs-table";

const NOW = START + 12 * 60_000;

function cells(row: HTMLElement): (string | null)[] {
    return within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
}

describe("RunsTable", () => {
    it("names the table and its columns", () => {
        render(<RunsTable runs={[]} now={NOW} />);
        expect(screen.getByRole("table", { name: "Runs, newest first" })).toBeTruthy();
        expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
            "Run",
            "Status",
            "Guard decisions",
            "Cost",
            "Spend",
            "Duration",
            "Started",
        ]);
    });

    it("shows a run's agent, id, size, status, decisions, cost, duration and age", () => {
        const run = makeRow({
            agents: ["billing", "researcher"],
            steps: 1234,
            status: "blocked",
            costUsd: 1.5,
            spendUsd: 0.004,
            durationMs: 75_000,
            decisions: { allowed: 4, asked: 1, blocked: 2 },
        });
        render(<RunsTable runs={[run]} now={NOW} />);
        const [, row] = screen.getAllByRole("row");
        expect(cells(row)).toEqual([
            "billingabcdef01 · 2 agents · 1,234 steps",
            "Blocked",
            "",
            "$1.50",
            "$0.004",
            "1 min 15 s",
            "12 min ago",
        ]);
        expect(within(row).getByRole("img", { name: "4 allowed, 1 asked, 2 blocked" })).toBeTruthy();
        expect(row.querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-03T12:00:00.000Z");
    });

    it("says spend is unknown when a settled token has no USD value, and None before any payment", () => {
        render(<RunsTable runs={[makeRow({ spendKnown: false }), makeRow({ id: "1".repeat(32) })]} now={NOW} />);
        const [, unknown, none] = screen.getAllByRole("row");
        expect(cells(unknown)[4]).toBe("Unknown");
        expect(cells(none)[4]).toBe("None");
    });

    it("opens the run from a link named for it", () => {
        render(<RunsTable runs={[makeRow()]} now={NOW} />);
        const link = screen.getByRole("link", { name: "Run abcdef01 by billing" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_ID}`);
    });

    it("uses singular words for one agent and one step", () => {
        render(<RunsTable runs={[makeRow({ agents: ["billing"], steps: 1 })]} now={NOW} />);
        expect(cells(screen.getAllByRole("row")[1])[0]).toBe("billingabcdef01 · 1 agent · 1 step");
    });

    it("says no decisions were made yet and shows a dash for an unknown cost", () => {
        const run = makeRow({ decisions: { allowed: 0, asked: 0, blocked: 0 }, costKnown: false });
        render(<RunsTable runs={[run]} now={NOW} />);
        const row = screen.getAllByRole("row")[1];
        expect(cells(row).slice(2, 4)).toEqual(["None yet", "—"]);
        expect(within(row).queryByRole("img")).toBeNull();
    });

    it("lists runs in the order given", () => {
        const runs = [
            makeRow({ id: "1".repeat(32), rootAgent: "writer" }),
            makeRow({ id: "2".repeat(32), rootAgent: "reader" }),
        ];
        render(<RunsTable runs={runs} now={NOW} />);
        expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
            "Run 11111111 by writer",
            "Run 22222222 by reader",
        ]);
    });
});
