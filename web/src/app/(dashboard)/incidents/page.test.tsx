import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listIncidents } from "@/lib/data/incidents/query";
import IncidentsPage, { metadata } from "./page";

async function showPage(searchParams: Record<string, string | string[]>) {
    render(await IncidentsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

// "3 of 9": the rows shown out of all incidents
function shownCount() {
    return screen.getByText((_, node) => node?.tagName === "P" && / of \d+$/.test(node.textContent ?? "")).textContent;
}

describe("IncidentsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Incidents");
    });

    it("lists every incident when no category is asked for", async () => {
        const all = await listIncidents();
        await showPage({});
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(shownCount()).toBe(`${all.length} of ${all.length}`);
    });

    it("starts filtered to a known category from the address", async () => {
        const all = await listIncidents();
        const category = all[0]!.category;
        await showPage({ category });
        const inCategory = all.filter((item) => item.category === category).length;
        expect(shownCount()).toBe(`${inCategory} of ${all.length}`);
    });

    it("ignores a category it does not know", async () => {
        const all = await listIncidents();
        await showPage({ category: "made up" });
        expect(shownCount()).toBe(`${all.length} of ${all.length}`);
    });

    it("ignores a category given twice", async () => {
        const all = await listIncidents();
        await showPage({ category: ["bad input", "bad handoff"] });
        expect(shownCount()).toBe(`${all.length} of ${all.length}`);
    });
});
