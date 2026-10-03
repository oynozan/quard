import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import SearchLoading from "./loading";

describe("SearchLoading", () => {
    it("keeps the heading and the field while the page loads, with no table", () => {
        render(<SearchLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Searching runs…");
        expectNoChartsOrTables();
    });
});
