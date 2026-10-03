import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { SearchSkeleton } from "./search-skeleton";

describe("SearchSkeleton", () => {
    it("draws only the field and tells screen readers runs are being searched", () => {
        const { container } = render(<SearchSkeleton />);
        const status = screen.getByRole("status");
        expect(status.textContent).toBe("Searching runs…");
        expect(status.className).toContain("sr-only");
        expect(container.querySelectorAll("[aria-hidden] > span")).toHaveLength(2);
        expectNoChartsOrTables();
    });
});
