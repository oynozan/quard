import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ROUND_CELLS_WIDTH, RoundCells } from "./round-cells";

// Each cell is one "M" move in its path
function cells(svg: SVGElement) {
    const [off, lit] = [...svg.querySelectorAll("path")];
    const count = (path: SVGPathElement) => (path.getAttribute("d") ?? "").split("M").length - 1;
    return { off: count(off), lit: count(lit), offFill: off.getAttribute("fill"), litFill: lit.getAttribute("fill") };
}

describe("RoundCells", () => {
    it("lights one cell per harmful rerun in the signal color", () => {
        const { container } = render(<RoundCells harmful={3} tone="signal" />);
        const svg = container.querySelector("svg") as SVGElement;
        expect(svg.getAttribute("width")).toBe(String(ROUND_CELLS_WIDTH));
        expect(svg.getAttribute("class")).toBe("block");
        expect(cells(svg)).toEqual({ off: 2, lit: 3, offFill: "var(--chart-field)", litFill: "var(--signal)" });
    });

    it("uses the context color for the reruns without the content", () => {
        const { container } = render(<RoundCells harmful={0} tone="context" />);
        const svg = container.querySelector("svg") as SVGElement;
        expect(cells(svg)).toEqual({ off: 5, lit: 0, offFill: "var(--chart-field)", litFill: "var(--chart-context)" });
    });

    it("pulses with unlit cells while the round is pending", () => {
        const { container } = render(<RoundCells harmful={0} tone="signal" pending />);
        const svg = container.querySelector("svg") as SVGElement;
        expect(svg.getAttribute("class")).toBe("block animate-pulse");
        expect(cells(svg).offFill).toBe("var(--segment-off)");
    });
});
