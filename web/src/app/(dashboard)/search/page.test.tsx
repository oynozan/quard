import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchState } from "@/lib/data/search";
import { resolveServer } from "../../../../test/auth-app/server";
import { matchOf, resultOf, RUN_B, runOf } from "../../../../test/incidents-search/search";
import SearchPage, { metadata } from "./page";

const searchRuns = vi.hoisted(() => vi.fn<(query: string) => Promise<SearchState>>());
vi.mock("@/lib/data/search", () => ({ searchRuns }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));

const HEADS = ["Step", "Agent", "Field", "Value", "Label", "Time"];

async function showPage(state: SearchState, q?: string | string[]) {
    searchRuns.mockResolvedValue(state);
    const page = await SearchPage({ params: Promise.resolve({}), searchParams: Promise.resolve(q ? { q } : {}) });
    render(await resolveServer(page));
}

function field() {
    return screen.getByRole("searchbox", { name: "Search all runs" }) as HTMLInputElement;
}

function heads() {
    return screen.getAllByRole("columnheader").map((head) => head.textContent);
}

function introTerms() {
    const intro = screen.getByRole("region", { name: "What you can search" });
    return within(intro)
        .getAllByRole("term")
        .map((term) => term.textContent);
}

describe("SearchPage", () => {
    beforeEach(() => {
        searchRuns.mockReset();
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Search");
    });

    it("says what can be searched before anything is typed, under the field and a tonal Search button", async () => {
        await showPage({ state: "idle" });
        expect(searchRuns).toHaveBeenCalledWith("");
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(field().getAttribute("placeholder")).toBe("Domain, URL, IBAN, email, file path, ID, agent or tool");
        expect(introTerms()).toEqual(["Domain or URL", "IBAN or email", "File path or ID", "Agent or tool"]);
        expect(screen.getByRole("button", { name: "Search" }).className).toContain("bg-control-hover");
        expect(screen.queryByText("Try")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("keeps the field and the intro before any run exists", async () => {
        await showPage({ state: "no-runs" });
        expect(field().value).toBe("");
        expect(introTerms()).toHaveLength(4);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("keeps the results header for a search before any run exists, saying there are none yet", async () => {
        await showPage({ state: "no-runs" }, "billing");
        expect(searchRuns).toHaveBeenCalledWith("billing");
        expect(field().value).toBe("billing");
        expect(heads()).toEqual(HEADS);
        expect(screen.getByRole("status").textContent).toBe("No runs yet");
        expect(screen.queryByRole("region", { name: "What you can search" })).toBeNull();
    });

    it("counts the matches and runs, grouping them under each run", async () => {
        const matches = [matchOf(), matchOf({ runId: RUN_B, stepId: "s7" })];
        const runRows = [runOf(), runOf({ id: RUN_B, rootAgent: "support" })];
        await showPage({ state: "searched", result: resultOf({ matches, runRows, total: 2, runs: 2 }) }, "example.com");
        expect(screen.getByRole("status").textContent).toBe("2 matches in 2 runs for example.com");
        const table = screen.getByRole("table");
        expect(within(table).getAllByRole("rowgroup", { name: /^Run / })).toHaveLength(2);
        expect(document.body.textContent).toContain("Started by support");
        expect(screen.getAllByRole("region", { name: /^Run / })).toHaveLength(2);
        expect(screen.queryByRole("region", { name: "What you can search" })).toBeNull();
    });

    it("keeps the results header when nothing matched, with a way to clear the search", async () => {
        await showPage(
            { state: "searched", result: resultOf({ matches: [], runRows: [], total: 0, runs: 0 }) },
            "example.org",
        );
        expect(field().value).toBe("example.org");
        expect(heads()).toEqual(HEADS);
        const state = screen.getByRole("status");
        expect(within(state).getByRole("heading", { level: 3, name: "No matches" })).toBeTruthy();
        expect(within(state).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/search");
    });

    it("says nothing matched when every matching run is gone", async () => {
        await showPage({ state: "searched", result: resultOf({ runRows: [] }) }, "example.com");
        expect(heads()).toEqual(HEADS);
        expect(screen.getByRole("heading", { level: 3, name: "No matches" })).toBeTruthy();
    });

    it.each([
        ["card", "Card numbers can't be searched"],
        ["hash-off", "IBAN and email search needs QUARD_HASH_KEY"],
        ["nothing", "No matches"],
    ] as const)("keeps the results header and says why a %s query was not searched", async (state, title) => {
        await showPage({ state }, "query");
        expect(heads()).toEqual(HEADS);
        const status = screen.getByRole("status");
        expect(within(status).getByRole("heading", { level: 3 }).textContent).toBe(title);
        expect(within(status).getByRole("link", { name: "Clear search" })).toBeTruthy();
    });

    it("searches only the first value in the address", async () => {
        await showPage({ state: "nothing" }, ["first", "second"]);
        expect(searchRuns).toHaveBeenCalledWith("first");
        expect(field().value).toBe("first");
    });
});
