import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBrowser } from "./search-browser";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

function show(query = "") {
    return render(
        <SearchBrowser query={query}>
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
        show("example.com");
        expect(field().value).toBe("example.com");
        expect(screen.getByRole("search", { name: "Search all runs" })).toBeTruthy();
        expect(results().getAttribute("aria-busy")).toBeNull();
        expect(results().getAttribute("data-pending")).toBe("false");
    });

    it("puts the typed query in the address on submit", () => {
        show();
        fireEvent.change(field(), { target: { value: " example.org " } });
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(router.push).toHaveBeenCalledWith("/search?q=example.org", { scroll: false });
    });

    it("offers no example queries", () => {
        show();
        expect(screen.queryByText("Try")).toBeNull();
        expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Search"]);
    });

    it("clears the field on Escape without searching", () => {
        show("example.com");
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
        const view = show("example.com");
        fireEvent.change(field(), { target: { value: "half typed" } });
        view.rerender(
            <SearchBrowser query="example.org">
                <p>Results</p>
            </SearchBrowser>,
        );
        expect(field().value).toBe("example.org");
    });

    it("shows Searching and dims the results while the page loads", async () => {
        let finish = () => {};
        router.push.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
        show();
        fireEvent.change(field(), { target: { value: "example.com" } });
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
