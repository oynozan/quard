import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INCIDENTS } from "../../../../test/incidents/list";
import { NOW } from "../../../../test/time";
import { IncidentsTable } from "./incidents-table";

function show(initialCategory = "all", incidents = INCIDENTS) {
    render(<IncidentsTable incidents={incidents} now={NOW} initialCategory={initialCategory} />);
}

function columns() {
    return within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((th) => th.textContent);
}

const COLUMNS = ["Incident", "Category", "Entry point", "Damage", "Agents", "Replay", "Opened"];

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

    it("shows dashes for the verdict while the finder works, and counts it in no category", async () => {
        const finding = {
            ...INCIDENTS[0],
            id: "inc_119",
            title: "Finding the root cause",
            category: null,
            entryPoint: null,
            damage: null,
            entryAgent: null,
            damageAgent: null,
            replay: "not started" as const,
        };
        show("all", [finding, ...INCIDENTS]);
        const row = screen.getByRole("link", { name: "Finding the root cause" }).closest("tr") as HTMLElement;
        const cells = within(row).getAllByRole("cell");
        expect(cells.map((cell) => cell.textContent)).toEqual([
            "Finding the root cause",
            "—",
            "—",
            "—",
            "—",
            "Not started",
            "3 min",
        ]);
        expect(cells[2].getAttribute("title")).toBe("—");
        fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
        await act(async () => {});
        expect(screen.getByRole("option", { name: "Bad input (1)" })).toBeTruthy();
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

    it("keeps the table header when no incident matches, and clears every filter", async () => {
        window.history.replaceState(null, "", "/incidents?category=bad+input");
        show("bad input");
        await pick("Replay status", "Confirmed");
        search("cap");
        expect(shownCount()).toBe("0 of 3");
        expect(columns()).toEqual(COLUMNS);
        expect(titles()).toEqual([]);
        expect(screen.getByRole("heading", { name: "No incidents match" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(shownCount()).toBe("3 of 3");
        expect((screen.getByRole("searchbox", { name: "Search incidents" }) as HTMLInputElement).value).toBe("");
        expect(screen.getByRole("combobox", { name: "Replay status" }).textContent).toBe("Any replay");
        expect(window.location.search).toBe("");
        expect(screen.queryByRole("heading", { name: "No incidents match" })).toBeNull();
        expect(titles()).toHaveLength(3);
    });

    it("keeps the toolbar and the table header over the empty state when nothing has opened yet", () => {
        show("all", []);
        expect(shownCount()).toBe("0 of 0");
        expect(screen.getByRole("searchbox", { name: "Search incidents" })).toBeTruthy();
        expect(columns()).toEqual(COLUMNS);
        expect(titles()).toEqual([]);
        expect(screen.getByRole("heading", { name: "No incidents yet" })).toBeTruthy();
        expect(screen.getByText("A blocked call or flagged content opens one here.")).toBeTruthy();
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
