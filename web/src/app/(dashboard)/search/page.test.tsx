import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchState } from "@/lib/data/search";
import { resolveServer } from "../../../../test/auth-app/server";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { matchOf, resultOf, RUN_B, runOf } from "../../../../test/incidents-search/search";
import SearchPage, { metadata } from "./page";

const searchRuns = vi.hoisted(() => vi.fn<(query: string) => Promise<SearchState>>());
vi.mock("@/lib/data/search", () => ({ searchRuns }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));

async function showPage(state: SearchState, q?: string | string[]) {
    searchRuns.mockResolvedValue(state);
    const page = await SearchPage({ params: Promise.resolve({}), searchParams: Promise.resolve(q ? { q } : {}) });
    render(await resolveServer(page));
}

describe("SearchPage", () => {
    beforeEach(() => {
        searchRuns.mockReset();
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Search");
    });

    it("shows only the heading and one line before any run exists, with no search field", async () => {
        await showPage({ state: "no-runs" }, "billing");
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No runs yet");
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(searchRuns).toHaveBeenCalledWith("billing");
        expectNoChartsOrTables();
    });

    it("shows the field and what can be searched before anything is typed", async () => {
        await showPage({ state: "idle" });
        expect(searchRuns).toHaveBeenCalledWith("");
        expect(screen.getByRole("searchbox", { name: "Search all runs" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "What you can search" })).toBeTruthy();
        expect(screen.queryByText("Try")).toBeNull();
        expectNoChartsOrTables();
    });

    it("counts the matches and runs, grouping them under each run", async () => {
        const matches = [matchOf(), matchOf({ runId: RUN_B, stepId: "s7" })];
        const runRows = [runOf(), runOf({ id: RUN_B, rootAgent: "support" })];
        await showPage({ state: "searched", result: resultOf({ matches, runRows, total: 2, runs: 2 }) }, "example.com");
        expect(screen.getByRole("status").textContent).toBe("2 matches in 2 runs for example.com");
        expect(screen.queryByText("What you can search")).toBeNull();
        const table = screen.getByRole("table");
        expect(within(table).getAllByRole("rowgroup", { name: /^Run / })).toHaveLength(2);
        expect(document.body.textContent).toContain("Started by support");
        expect(screen.getAllByRole("region", { name: /^Run / })).toHaveLength(2);
    });

    it("says nothing matched in one line, with no table header", async () => {
        await showPage(
            { state: "searched", result: resultOf({ matches: [], runRows: [], total: 0, runs: 0 }) },
            "example.org",
        );
        expect(screen.getByRole("searchbox", { name: "Search all runs" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No matches");
        expectNoChartsOrTables();
    });

    it.each([
        ["card", "Card numbers can't be searched"],
        ["hash-off", "IBAN and email search is offSet QUARD_HASH_KEY to the key your agents use"],
        ["nothing", "Not an IBAN, email, URL, domain, path, ID, agent or tool"],
    ] as const)("says why a %s query was not searched", async (state, line) => {
        await showPage({ state }, "query");
        expect(screen.getByRole("status").textContent).toBe(line);
        expectNoChartsOrTables();
    });

    it("searches only the first value in the address", async () => {
        await showPage({ state: "nothing" }, ["first", "second"]);
        expect(searchRuns).toHaveBeenCalledWith("first");
        expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("first");
    });
});
