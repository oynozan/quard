import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchError from "./error";

describe("SearchError", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says the search failed, logs it, and offers to retry or start over", () => {
        const error = new Error("search failed");
        const retry = vi.fn();
        render(<SearchError error={error} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Could not search runs.");
        expect(alert.textContent).toContain("Your search is kept in the address, so trying again runs it again.");
        expect(console.error).toHaveBeenCalledWith(error);
        expect(screen.getByRole("link", { name: "Start a new search" }).getAttribute("href")).toBe("/search");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
