import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
    it("says the page is gone and offers search and the overview", () => {
        render(<NotFound />);
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
        expect(screen.getByText("404")).toBeTruthy();
        expect(screen.getByText("It may have expired with the retention window.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Search runs" }).getAttribute("href")).toBe("/search");
        expect(screen.getByRole("link", { name: "Go to overview" }).getAttribute("href")).toBe("/");
        expect(screen.getByRole("main").id).toBe("content");
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Page not found");
    });
});
