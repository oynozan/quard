import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
    it("says what happened and links home", () => {
        render(<NotFound />);
        expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
        expect(screen.getByText("404")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Go to the docs home" }).getAttribute("href")).toBe("/");
    });

    it("names the page in the title", () => {
        expect(metadata.title).toBe("Page not found");
    });
});
