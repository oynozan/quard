import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunsSkeleton } from "./runs-skeleton";

describe("RunsSkeleton", () => {
    it("keeps the real column headers and announces that runs are loading", () => {
        render(<RunsSkeleton />);
        expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
            "Run",
            "Status",
            "Guard decisions",
            "Cost",
            "Spend",
            "Duration",
            "Started",
        ]);
        expect(screen.getByRole("status").textContent).toBe("Loading runs…");
    });

    it("draws five loading rows with a selection cell and seven columns each", () => {
        const { container } = render(<RunsSkeleton />);
        const body = container.querySelector("tbody");
        expect(body?.getAttribute("aria-busy")).toBe("true");
        const rows = body?.querySelectorAll("tr") ?? [];
        expect(rows).toHaveLength(5);
        expect(rows[0].querySelectorAll("td")).toHaveLength(8);
        expect(container.querySelectorAll("col")).toHaveLength(8);
    });
});
