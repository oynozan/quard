import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRow } from "../../../../test/runs-detail-list/fixtures";
import { HOUR, NOW } from "../../../../test/time";
import type { RunQuery, RunRow } from "@/lib/data/runs/types";
import { shortId } from "@/lib/format";
import RunsPage, { metadata } from "./page";

const query = vi.hoisted(() => ({
    all: [] as RunRow[],
    shown: [] as RunRow[],
    listRuns: vi.fn(),
}));
vi.mock("@/lib/data/runs/query", () => ({
    // Without a filter it reads every run, and with one it reads the matches
    listRuns: (filter?: RunQuery) => {
        query.listRuns(filter);
        return Promise.resolve(filter ? query.shown : query.all);
    },
}));
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const ROWS = [
    makeRow({ id: "a".repeat(32), rootAgent: "billing", agents: ["billing"], startedAt: NOW - 2 * HOUR }),
    makeRow({
        id: "b".repeat(32),
        rootAgent: "orchestrator",
        agents: ["orchestrator", "billing"],
        status: "failed",
        startedAt: NOW - 3 * HOUR,
    }),
    makeRow({ id: "c".repeat(32), rootAgent: "support", agents: ["support"], startedAt: NOW - 5 * HOUR }),
];

async function showPage(searchParams: Record<string, string> = {}) {
    render(await RunsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

const heading = () => screen.getByRole("heading", { level: 1 });
const runLink = (run: RunRow) => screen.getByRole("link", { name: `Run ${shortId(run.id)} by ${run.rootAgent}` });

// The table keeps its header row, with no run rows under it
function expectHeaderOnly() {
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Run", "Status", "Guard decisions", "Cost", "Duration", "Started"]);
    expect(screen.getAllByRole("row")).toHaveLength(1);
}

describe("RunsPage", () => {
    beforeEach(() => {
        query.listRuns.mockClear();
        query.all = ROWS;
        query.shown = ROWS;
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Runs");
    });

    it("lists every run with its count and age, reading the runs once", async () => {
        await showPage();
        expect(heading().textContent).toBe("Runs3");
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs");
        expect(query.listRuns).toHaveBeenCalledTimes(1);
        expect(query.listRuns).toHaveBeenCalledWith(undefined);
        expect(screen.getByRole("status").textContent).toBe("");
        const link = runLink(ROWS[0]!);
        expect(link.getAttribute("href")).toBe(`/runs/${ROWS[0]!.id}`);
        expect(link.closest("tr")!.textContent).toContain("2 h ago");
    });

    it("offers every recorded agent in the filter, even when the filter narrows the list", async () => {
        query.shown = ROWS.slice(0, 1);
        await showPage({ status: "failed" });
        await act(async () => fireEvent.click(screen.getByRole("combobox", { name: "Filter by agent" })));
        const options = screen.getAllByRole("option").map((option) => option.textContent);
        expect(options).toEqual(["All agents", "billing", "orchestrator", "support"]);
    });

    it("passes the filters from the address on and counts the matches", async () => {
        query.shown = ROWS.slice(0, 2);
        await showPage({ q: "invoice", agent: "billing", status: "blocked" });
        expect(query.listRuns).toHaveBeenCalledWith({ query: "invoice", agent: "billing", status: "blocked" });
        expect(heading().textContent).toBe("Runs2");
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs that match the filters");
        expect(screen.getByText("2 runs match")).toBeTruthy();
    });

    it("says one run matches in the singular", async () => {
        query.shown = ROWS.slice(0, 1);
        await showPage({ status: "failed" });
        expect(screen.getByText("1 run matches")).toBeTruthy();
        expect(runLink(ROWS[0]!)).toBeTruthy();
    });

    it("keeps the toolbar and the header row and offers to clear filters that match nothing", async () => {
        query.shown = [];
        await showPage({ q: "nothing" });
        expect(heading().textContent).toBe("Runs0");
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs that match the filters");
        expect(screen.getByText("0 runs match")).toBeTruthy();
        expect(screen.getByRole("searchbox", { name: "Search runs" })).toBeTruthy();
        expectHeaderOnly();
        expect(screen.getByRole("heading", { level: 3, name: "No runs match" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/runs");
    });

    it("keeps the whole page for a project with no runs, with no runs yet under the header row", async () => {
        query.all = [];
        query.shown = [];
        await showPage();
        expect(heading().textContent).toBe("Runs0");
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs");
        expect(screen.getByRole("searchbox", { name: "Search runs" })).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Filter by agent" })).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeTruthy();
        expect(screen.getByRole("list", { name: "Guard decision colors" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Refresh runs" })).toBeTruthy();
        expectHeaderOnly();
        expect(screen.getByRole("heading", { level: 3, name: "No runs yet" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    });

    it("says there are no runs yet whatever filters the address carries", async () => {
        query.all = [];
        query.shown = [];
        await showPage({ q: "pay", status: "failed" });
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs");
        expect(screen.getByRole("searchbox", { name: "Search runs" })).toHaveProperty("value", "pay");
        expectHeaderOnly();
        expect(screen.getByRole("heading", { level: 3, name: "No runs yet" })).toBeTruthy();
        expect(screen.queryByText("0 runs match")).toBeNull();
        expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    });
});
