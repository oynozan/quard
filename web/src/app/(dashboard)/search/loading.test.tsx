import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SearchLoading from "./loading";

describe("SearchLoading", () => {
    it("keeps the heading while the results load", () => {
        render(<SearchLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Searching runs…");
    });
});
