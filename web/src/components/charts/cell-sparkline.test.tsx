import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cellCount, pathByFill } from "../../../test/charts-rest/dom";
import { CellSparkline } from "./cell-sparkline";

const HISTORY = "var(--chart-context)";
const NOW = "var(--signal)";

// Three 4px columns with 2px gaps span 16px; 4 rows of 4px cells stand 22px tall
function sparkline(values: number[]) {
    return render(<CellSparkline values={values} width={16} rows={4} cell={4} label="Calls this week" />);
}

describe("CellSparkline", () => {
    it("is a labelled image sized to the track and its rows", () => {
        sparkline([1, 2, 4]);
        const chart = screen.getByRole("img", { name: "Calls this week" });
        expect(chart.getAttribute("width")).toBe("16");
        expect(chart.getAttribute("height")).toBe("22");
    });

    it("draws history in gray and the newest column in green, scaled to the highest value", () => {
        const { container } = sparkline([1, 2, 4]);
        expect(cellCount(pathByFill(container, HISTORY))).toBe(3);
        expect(cellCount(pathByFill(container, NOW))).toBe(4);
    });

    it("draws no green column when the newest value is zero", () => {
        const { container } = sparkline([3, 0]);
        // 3 is the highest, so it fills all 4 rows
        expect(cellCount(pathByFill(container, HISTORY))).toBe(4);
        expect(pathByFill(container, NOW)?.getAttribute("d")).toBe("");
    });

    it("lights nothing but the faint field when every value is zero", () => {
        const { container } = sparkline([0, 0, 0]);
        expect(pathByFill(container, HISTORY)?.getAttribute("d")).toBe("");
        expect(pathByFill(container, NOW)?.getAttribute("d")).toBe("");
        expect(cellCount(pathByFill(container, "var(--chart-field)"))).toBe(12);
    });
});
