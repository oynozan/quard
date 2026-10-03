import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveServer } from "../../../../test/auth-app/server";
import { catalogRows } from "@/lib/data/runs/catalog";
import { searchRuns } from "@/lib/data/search";
import SearchPage, { metadata } from "./page";

vi.mock("@/lib/data/runs/query", () => ({ listRuns: async () => catalogRows() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));

async function showPage(q?: string | string[]) {
    const page = await SearchPage({ params: Promise.resolve({}), searchParams: Promise.resolve(q ? { q } : {}) });
    render(await resolveServer(page));
}

describe("SearchPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Search");
    });

    it("shows the intro and examples before anything is searched", async () => {
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "What you can search" })).toBeTruthy();
        expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    });

    it("counts the matches and runs for a search, naming who started each run", async () => {
        const result = await searchRuns("pay_invoice");
        expect(result.total).toBeGreaterThan(0);
        const run = catalogRows().find((row) => row.id === result.matches[0]!.runId)!;
        await showPage("pay_invoice");
        const summary = screen.getByText(
            (_, node) => node?.tagName === "H2" && / in \d+ runs?/.test(node.textContent!),
        );
        expect(summary.textContent).toContain(`${result.total} matches in ${result.runs} runs`);
        expect(screen.queryByText("What you can search")).toBeNull();
        expect(document.body.textContent).toContain(`Started by ${run.rootAgent}`);
    });

    it("asks for more than two characters of text", async () => {
        await showPage("ab");
        expect(screen.getByRole("heading", { level: 3, name: "Type a little more" })).toBeTruthy();
    });

    it("says nothing matched a longer text, reading only the first value in the address", async () => {
        await showPage(["zzqqxx", "ab"]);
        expect(screen.getByRole("heading", { level: 3, name: "No matches" })).toBeTruthy();
        expect(screen.getByText("Try a shorter value or the main domain.")).toBeTruthy();
    });

    it("says nothing matched an email, which is searched by hash", async () => {
        const result = await searchRuns("nobody@nowhere.example");
        expect(result.byHash).toBe(true);
        await showPage("nobody@nowhere.example");
        expect(screen.getByRole("heading", { level: 3, name: "No matches" })).toBeTruthy();
        expect(screen.getByText("Sensitive values match only in full.")).toBeTruthy();
    });
});
