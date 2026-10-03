import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAY, NOW } from "@/lib/data/rng";
import { catalogRows } from "@/lib/data/runs/catalog";
import type { RunQuery, RunRow } from "@/lib/data/runs/types";
import { shortId } from "@/lib/format";
import RunsPage, { metadata } from "./page";

const query = vi.hoisted(() => ({
    all: [] as RunRow[],
    shown: [] as RunRow[],
    listRuns: vi.fn(),
}));
vi.mock("@/lib/data/runs/query", () => ({
    // The first call reads every run for the agent list; the second applies the filter
    listRuns: (filter?: RunQuery) => {
        query.listRuns(filter);
        return Promise.resolve(filter ? query.shown : query.all);
    },
    // Two days after the sample runs, so every row reads "2 d"
    requestTime: async () => NOW + 2 * DAY,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const ROWS = catalogRows();

async function showPage(searchParams: Record<string, string> = {}) {
    render(await RunsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

const heading = () => screen.getByRole("heading", { level: 1 });
const runLink = (run: RunRow) => screen.getByRole("link", { name: `Run ${shortId(run.id)} by ${run.rootAgent}` });

describe("RunsPage", () => {
    beforeEach(() => {
        query.listRuns.mockClear();
        query.all = ROWS;
        query.shown = ROWS;
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Runs");
    });

    it("lists recent runs with their count and age, and asks for no filter", async () => {
        await showPage();
        expect(heading().textContent).toBe(`Runs${ROWS.length}`);
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs in the last 6 hours");
        expect(query.listRuns).toHaveBeenCalledWith({ query: undefined, agent: undefined, status: undefined });
        expect(screen.getByRole("status").textContent).toBe("");
        const link = runLink(ROWS[0]!);
        expect(link.getAttribute("href")).toBe(`/runs/${ROWS[0]!.id}`);
        expect(link.closest("tr")!.textContent).toContain("2 d");
    });

    it("offers every recorded agent in the filter, even when the filter narrows the list", async () => {
        query.shown = ROWS.slice(0, 1);
        await showPage({ status: "failed" });
        await act(async () => fireEvent.click(screen.getByRole("combobox", { name: "Filter by agent" })));
        const agents = [...new Set(ROWS.flatMap((run) => run.agents))].sort();
        expect(agents.length).toBeGreaterThan(ROWS[0]!.agents.length);
        const options = screen.getAllByRole("option").map((option) => option.textContent);
        expect(options).toEqual(["All agents", ...agents]);
    });

    it("passes the filters from the address on and counts the matches", async () => {
        query.shown = ROWS.slice(0, 3);
        await showPage({ q: "invoice", agent: "billing", status: "blocked" });
        expect(query.listRuns).toHaveBeenCalledWith({ query: "invoice", agent: "billing", status: "blocked" });
        expect(heading().textContent).toBe("Runs3");
        expect(heading().querySelector("[title]")!.getAttribute("title")).toBe("Runs that match the filters");
        expect(screen.getByText("3 runs match")).toBeTruthy();
    });

    it("says one run matches in the singular", async () => {
        query.shown = ROWS.slice(0, 1);
        await showPage({ status: "failed" });
        expect(screen.getByText("1 run matches")).toBeTruthy();
        expect(runLink(ROWS[0]!)).toBeTruthy();
    });

    it("offers to clear filters that match nothing", async () => {
        query.shown = [];
        await showPage({ q: "nothing" });
        expect(screen.getByText("0 runs match")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 3, name: "No runs match" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/runs");
    });

    it("says there are no runs yet when nothing has been recorded", async () => {
        query.all = [];
        query.shown = [];
        await showPage();
        expect(screen.getByRole("heading", { level: 3, name: "No runs yet" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    });
});
