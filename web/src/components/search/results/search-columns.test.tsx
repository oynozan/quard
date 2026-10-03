import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEARCH_COLUMNS, SearchColgroup, SearchHead } from "./search-columns";

describe("SearchColgroup and SearchHead", () => {
    it("sets one width per column and heads them, with Step over the first two", () => {
        const { container } = render(
            <table>
                <SearchColgroup />
                <SearchHead />
            </table>,
        );
        const widths = [...container.querySelectorAll("col")].map((col) => col.style.width);
        expect(widths).toEqual(["44px", "22%", "12%", "11%", "22%", "19%", "14%"]);
        expect(widths).toHaveLength(SEARCH_COLUMNS);
        const heads = screen.getAllByRole("columnheader");
        expect(heads.map((head) => head.textContent)).toEqual(["Step", "Agent", "Field", "Value", "Label", "Time"]);
        expect(heads[0].getAttribute("colspan")).toBe("2");
    });
});
