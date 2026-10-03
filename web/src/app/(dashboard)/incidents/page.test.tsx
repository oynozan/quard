import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { listIncidents } from "@/lib/data/incidents/query";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { INCIDENTS } from "../../../../test/incidents/list";
import { NOW } from "../../../../test/time";
import IncidentsPage, { metadata } from "./page";

vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/data/incidents/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/data/incidents/query")>();
    return { ...real, listIncidents: vi.fn(real.listIncidents) };
});

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

    it("shows only the heading and one line before the first incident", async () => {
        const { container } = await showPage({ category: "bad input" });
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No incidents yet");
        expect(screen.queryByRole("searchbox")).toBeNull();
        expectNoChartsOrTables(container);
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
