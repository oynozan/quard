import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchSkeleton } from "./search-skeleton";

describe("SearchSkeleton", () => {
    it("tells screen readers runs are being searched under the real column heads", () => {
        render(<SearchSkeleton />);
        expect(screen.getByRole("status").textContent).toBe("Searching runs…");
        expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
            "Step",
            "Agent",
            "Field",
            "Value",
            "Label",
            "Time",
        ]);
    });

    it("fills five busy rows with a selection cell and six columns", () => {
        render(<SearchSkeleton />);
        const body = screen.getAllByRole("rowgroup")[1];
        expect(body.getAttribute("aria-busy")).toBe("true");
        const rows = body.querySelectorAll("tr");
        expect(rows).toHaveLength(5);
        expect(rows[0].querySelectorAll("td")).toHaveLength(7);
    });
});
