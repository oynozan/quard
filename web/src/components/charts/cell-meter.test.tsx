import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cellCount, pathByFill } from "../../../test/charts-rest/dom";
import { CellMeter } from "./cell-meter";

const LIT = "var(--progress-fill, var(--signal))";
const OFF = "var(--segment-off)";

// 10 cells of 4px with 2px gaps fill 58px exactly
function meter(value: number, max: number) {
    return render(<CellMeter value={value} max={max} cells={10} width={58} label="Budget used" />);
}

describe("CellMeter", () => {
    it("reports its value and limit as a labelled progress bar", () => {
        meter(30, 120);
        const bar = screen.getByRole("progressbar", { name: "Budget used" });
        expect(bar.getAttribute("aria-valuemin")).toBe("0");
        expect(bar.getAttribute("aria-valuemax")).toBe("120");
        expect(bar.getAttribute("aria-valuenow")).toBe("30");
        expect(bar.getAttribute("width")).toBe("58");
        expect(bar.getAttribute("height")).toBe("4");
    });

    it("lights cells from the left in proportion to the value", () => {
        const { container } = meter(5, 10);
        expect(cellCount(pathByFill(container, LIT))).toBe(5);
        expect(cellCount(pathByFill(container, OFF))).toBe(5);
        expect(pathByFill(container, LIT)?.getAttribute("d")?.startsWith("M0 0")).toBe(true);
    });

    it("lights one cell for any value above zero", () => {
        const { container } = meter(1, 100);
        expect(cellCount(pathByFill(container, LIT))).toBe(1);
    });

    it("rounds to the nearest cell", () => {
        expect(cellCount(pathByFill(meter(26, 100).container, LIT))).toBe(3);
        expect(cellCount(pathByFill(meter(24, 100).container, LIT))).toBe(2);
    });

    it("lights every cell when the value passes the limit", () => {
        const { container } = meter(150, 100);
        expect(cellCount(pathByFill(container, LIT))).toBe(10);
        expect(cellCount(pathByFill(container, OFF))).toBe(0);
    });

    it("lights nothing for a negative value", () => {
        const { container } = meter(-5, 100);
        expect(cellCount(pathByFill(container, LIT))).toBe(0);
    });

    it("lights nothing when there is no limit", () => {
        const { container } = meter(5, 0);
        expect(cellCount(pathByFill(container, LIT))).toBe(0);
        expect(cellCount(pathByFill(container, OFF))).toBe(10);
    });
});
