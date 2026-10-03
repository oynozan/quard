import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonRows } from "./skeleton-rows";

function inTable(node: React.ReactNode) {
    return render(<table>{node}</table>);
}

describe("SkeletonRows", () => {
    it("shows five busy rows and announces loading once", () => {
        const { container } = inTable(<SkeletonRows columns={3} />);
        expect(container.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
        expect(screen.getAllByRole("row")).toHaveLength(5);
        expect(screen.getAllByRole("status")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toBe("Loading…");
        const firstRow = screen.getAllByRole("row")[0];
        expect(firstRow.querySelectorAll("td")).toHaveLength(3);
        const bars = [...firstRow.querySelectorAll<HTMLElement>(".skel")].map((bar) => bar.style.width);
        expect(bars).toEqual(["150px", "72px", "72px"]);
    });

    it("adds the empty selection cell first and uses its own count and label", () => {
        inTable(<SkeletonRows columns={2} rows={4} selection label="Loading runs…" />);
        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(4);
        expect(rows[0].querySelectorAll("td")).toHaveLength(3);
        expect(rows[0].firstElementChild?.children).toHaveLength(0);
        expect(screen.getByRole("status").textContent).toBe("Loading runs…");
    });
});
