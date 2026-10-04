import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { listIncidents } from "@/lib/data/incidents/query";
import { INCIDENTS } from "../../../../test/incidents/list";
import { NOW } from "../../../../test/time";
import IncidentsPage, { metadata } from "./page";

vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/data/incidents/query", () => ({ listIncidents: vi.fn(async () => []) }));

async function showPage(searchParams: Record<string, string | string[]> = {}) {
    return render(await IncidentsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

// The page with three stored incidents
async function showList(searchParams: Record<string, string | string[]> = {}) {
    vi.mocked(listIncidents).mockResolvedValueOnce(INCIDENTS);
    await showPage(searchParams);
}

// "3 of 3": the rows shown out of all incidents
function shownCount() {
    return screen.getByText((_, node) => node?.tagName === "P" && / of \d+$/.test(node.textContent ?? "")).textContent;
}

describe("IncidentsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Incidents");
    });

    it("keeps the toolbar and the table header over the empty state before the first incident", async () => {
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(screen.getByRole("searchbox", { name: "Search incidents" })).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Category" }).textContent).toBe("All categories");
        expect(screen.getByRole("combobox", { name: "Replay status" }).textContent).toBe("Any replay");
        expect(shownCount()).toBe("0 of 0");
        const table = screen.getByRole("table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((th) => th.textContent),
        ).toEqual(["Incident", "Category", "Entry point", "Damage", "Agents", "Replay", "Opened"]);
        expect(within(table).queryAllByRole("link")).toHaveLength(0);
        expect(screen.getByRole("heading", { level: 3, name: "No incidents yet" })).toBeTruthy();
        expect(screen.getByText("Blocked or flagged harm opens one here.")).toBeTruthy();
    });

    it("keeps a category from the address over the empty table, with a way to clear it", async () => {
        await showPage({ category: "bad input" });
        expect(screen.getByRole("combobox", { name: "Category" }).textContent).toBe("Bad input (0)");
        expect(screen.getAllByRole("columnheader")).toHaveLength(7);
        expect(screen.getByRole("heading", { level: 3, name: "No incidents match" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    });

    it("lists every incident when no category is asked for", async () => {
        await showList();
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(shownCount()).toBe("3 of 3");
        expect(screen.getByText("3 min")).toBeTruthy();
    });

    it("starts filtered to a known category from the address", async () => {
        await showList({ category: "bad handoff" });
        expect(shownCount()).toBe("1 of 3");
    });

    it("ignores a category it does not know", async () => {
        await showList({ category: "made up" });
        expect(shownCount()).toBe("3 of 3");
    });

    it("ignores a category given twice", async () => {
        await showList({ category: ["bad input", "bad handoff"] });
        expect(shownCount()).toBe("3 of 3");
    });
});
