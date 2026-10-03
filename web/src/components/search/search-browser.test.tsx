import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_EXAMPLES } from "@/lib/data/search";
import { SearchBrowser } from "./search-browser";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

function show(query = "") {
    return render(
        <SearchBrowser query={query} examples={SEARCH_EXAMPLES}>
            <p>Results</p>
        </SearchBrowser>,
    );
}

function field() {
    return screen.getByRole("searchbox", { name: "Search all runs" }) as HTMLInputElement;
}

function results() {
    return screen.getByText("Results").parentElement as HTMLElement;
}

describe("SearchBrowser", () => {
    afterEach(() => {
        router.push.mockReset();
    });

    it("starts with the query from the address and its results below", () => {
        show("claims-desk.io");
        expect(field().value).toBe("claims-desk.io");
        expect(screen.getByRole("search", { name: "Search all runs" })).toBeTruthy();
        expect(results().getAttribute("aria-busy")).toBeNull();
        expect(results().getAttribute("data-pending")).toBe("false");
    });

    it("puts the typed query in the address on submit", () => {
        show();
        fireEvent.change(field(), { target: { value: " INV-20931 " } });
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(router.push).toHaveBeenCalledWith("/search?q=INV-20931", { scroll: false });
    });

    it("runs an example query in one click and marks the current one", () => {
        show("pay_invoice");
        const current = screen.getByRole("button", { name: "pay_invoice" });
        expect(current.getAttribute("aria-current")).toBe("true");
        const other = screen.getByRole("button", { name: "researcher" });
        expect(other.getAttribute("aria-current")).toBeNull();
        expect(other.title).toBe("researcher");

        fireEvent.click(other);
        expect(field().value).toBe("researcher");
        expect(router.push).toHaveBeenCalledWith("/search?q=researcher", { scroll: false });
    });

    it("lists every example after Try, in order", () => {
        show();
        const examples = screen.getByText("Try").parentElement as HTMLElement;
        const names = within(examples)
            .getAllByRole("button")
            .map((button) => button.textContent);
        expect(names).toEqual(SEARCH_EXAMPLES.map((example) => example.query));
    });

    it("clears the field on Escape without searching", () => {
        show("claims-desk.io");
        const escape = fireEvent.keyDown(field(), { key: "Escape" });
        expect(escape).toBe(false);
        expect(field().value).toBe("");
        expect(router.push).not.toHaveBeenCalled();
    });

    it("leaves Escape alone on an empty field and ignores other keys", () => {
        show();
        expect(fireEvent.keyDown(field(), { key: "Escape" })).toBe(true);
        fireEvent.change(field(), { target: { value: "abc" } });
        fireEvent.keyDown(field(), { key: "a" });
        expect(field().value).toBe("abc");
    });

    it("follows the address when back or forward changes the query", () => {
        const view = show("claims-desk.io");
        fireEvent.change(field(), { target: { value: "half typed" } });
        view.rerender(
            <SearchBrowser query="INV-20931" examples={SEARCH_EXAMPLES}>
                <p>Results</p>
            </SearchBrowser>,
        );
        expect(field().value).toBe("INV-20931");
        expect(screen.getByRole("button", { name: "INV-20931" }).getAttribute("aria-current")).toBe("true");
    });

    it("shows Searching and dims the results while the page loads", async () => {
        let finish = () => {};
        router.push.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
        show();
        fireEvent.change(field(), { target: { value: "claims-desk.io" } });
        fireEvent.submit(screen.getByRole("search"));

        const busy = screen.getByRole("button", { name: "Searching…" }) as HTMLButtonElement;
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(results().getAttribute("aria-busy")).toBe("true");
        expect(results().getAttribute("data-pending")).toBe("true");

        await act(async () => finish());
        expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
        expect(results().getAttribute("aria-busy")).toBeNull();
    });
});
