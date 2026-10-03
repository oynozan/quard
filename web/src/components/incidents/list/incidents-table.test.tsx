import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "@/lib/data/types";
import { IncidentsTable } from "./incidents-table";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const INCIDENTS: Incident[] = [
    {
        id: "inc_118",
        runId: "r118",
        title: "Payment to an IBAN copied from a supplier page",
        category: "bad input",
        entryPoint: "fetch_page · supplier-portal.example",
        damage: "pay_invoice asked with an untrusted IBAN",
        entryAgent: "researcher",
        damageAgent: "billing",
        replay: "running",
        openedAt: NOW - 3 * MINUTE,
    },
    {
        id: "inc_117",
        runId: "r117",
        title: "Spending cap dropped in a handoff",
        category: "bad handoff",
        entryPoint: "delegate · orchestrator to billing",
        damage: "pay_invoice blocked by the daily cap",
        entryAgent: "orchestrator",
        damageAgent: "billing",
        replay: "confirmed",
        openedAt: NOW - 5 * HOUR,
    },
    {
        id: "inc_115",
        runId: "r115",
        title: "Customer list sent to an unlisted domain",
        category: "missing guard",
        entryPoint: "search_docs · docs.acme.internal",
        damage: "export_contacts ran without an egress guard",
        entryAgent: "support",
        damageAgent: "support",
        replay: "not confirmed",
        openedAt: NOW - 48 * HOUR,
    },
];

function show(initialCategory = "all", incidents = INCIDENTS) {
    render(<IncidentsTable incidents={incidents} now={NOW} initialCategory={initialCategory} />);
}

// Opens a filter menu and picks one of its options
async function pick(filter: string, option: string) {
    fireEvent.click(screen.getByRole("combobox", { name: filter }));
    await act(async () => {});
    const item = screen.getByRole("option", { name: option });
    fireEvent.pointerDown(item);
    fireEvent.pointerUp(item);
    fireEvent.click(item);
    await act(async () => {});
}

function search(text: string) {
    fireEvent.change(screen.getByRole("searchbox", { name: "Search incidents" }), { target: { value: text } });
}

function shownCount() {
    return screen.getByRole("status").textContent;
}

function titles() {
    return within(screen.getByRole("table"))
        .queryAllByRole("link")
        .map((link) => link.getAttribute("title"));
}

describe("IncidentsTable", () => {
    beforeEach(() => {
        window.history.replaceState(null, "", "/incidents");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lists every incident with a link to its page", () => {
        show();
        expect(shownCount()).toBe("3 of 3");
        const link = screen.getByRole("link", { name: "Payment to an IBAN copied from a supplier page" });
        expect(link.getAttribute("href")).toBe("/incidents/inc_118");
        const row = link.closest("tr") as HTMLElement;
        const cells = within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent);
        expect(cells).toEqual([
            "Payment to an IBAN copied from a supplier page",
            "bad input",
            "fetch_page · supplier-portal.example",
            "pay_invoice asked with an untrusted IBAN",
            "researcher → billing",
            "Replaying",
            "3 min",
        ]);
        expect(within(row).getAllByRole("cell")[6].getAttribute("title")).toBe("3 Oct");
    });

    it("names the agent once when one agent did both", () => {
        show();
        const row = screen.getByRole("link", { name: "Customer list sent to an unlisted domain" }).closest("tr");
        const cells = within(row as HTMLElement).getAllByRole("cell");
        expect(cells[4].textContent).toBe("support");
        expect(cells[5].textContent).toBe("Not confirmed");
        expect(cells[6].textContent).toBe("2 d");
    });

    it("filters by text in any field, ignoring case and spaces", () => {
        show();
        search("  ORCHESTRATOR ");
        expect(shownCount()).toBe("1 of 3");
        expect(titles()).toEqual(["Spending cap dropped in a handoff"]);
        search("inc_115");
        expect(titles()).toEqual(["Customer list sent to an unlisted domain"]);
    });

    it("counts each category in its menu and filters by it into the address bar", async () => {
        show();
        fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
        await act(async () => {});
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "All categories",
            "Bad input (1)",
            "Bad reasoning (0)",
            "Bad handoff (1)",
            "Broken tool (0)",
            "Missing guard (1)",
        ]);
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
        await act(async () => {});

        await pick("Category", "Bad handoff (1)");
        expect(titles()).toEqual(["Spending cap dropped in a handoff"]);
        expect(window.location.search).toBe("?category=bad+handoff");

        await pick("Category", "All categories");
        expect(shownCount()).toBe("3 of 3");
        expect(window.location.search).toBe("");
    });

    it("starts on the category given by the page", () => {
        show("missing guard");
        expect(titles()).toEqual(["Customer list sent to an unlisted domain"]);
        expect(screen.getByRole("combobox", { name: "Category" }).textContent).toBe("Missing guard (1)");
    });

    it("filters by replay status", async () => {
        show();
        await pick("Replay status", "Confirmed");
        expect(titles()).toEqual(["Spending cap dropped in a handoff"]);
        expect(shownCount()).toBe("1 of 3");
    });

    it("offers to clear the filters when none match, and clears them all", async () => {
        window.history.replaceState(null, "", "/incidents?category=bad+input");
        show("bad input");
        await pick("Replay status", "Confirmed");
        search("cap");
        expect(shownCount()).toBe("0 of 3");
        expect(screen.getByRole("heading", { name: "No incidents match" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(shownCount()).toBe("3 of 3");
        expect((screen.getByRole("searchbox", { name: "Search incidents" }) as HTMLInputElement).value).toBe("");
        expect(screen.getByRole("combobox", { name: "Replay status" }).textContent).toBe("Any replay");
        expect(window.location.search).toBe("");
        expect(screen.queryByRole("heading", { name: "No incidents match" })).toBeNull();
    });

    it("explains an empty list when nothing has opened yet", () => {
        show("all", []);
        expect(shownCount()).toBe("0 of 0");
        expect(screen.getByRole("heading", { name: "No incidents yet" })).toBeTruthy();
        expect(screen.getByText("Blocked or flagged harm opens one here.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    });

    it("still filters when the address bar cannot be written", async () => {
        vi.spyOn(window.history, "replaceState").mockImplementation(() => {
            throw new Error("blocked");
        });
        show();
        await pick("Category", "Bad input (1)");
        expect(titles()).toEqual(["Payment to an IBAN copied from a supplier page"]);
        expect(window.location.search).toBe("");
    });
});
