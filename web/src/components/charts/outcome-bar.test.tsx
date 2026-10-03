import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cellCount, pathByFill } from "../../../test/charts-rest/dom";
import { OutcomeBar } from "./outcome-bar";

const ALLOWED = "var(--chart-context)";
const ASKED = "var(--warning)";
const BLOCKED = "var(--danger)";
const EMPTY = "var(--chart-field)";

describe("OutcomeBar", () => {
    it("names the counts and splits 30 cells between them", () => {
        const { container } = render(<OutcomeBar counts={{ allowed: 20, asked: 5, blocked: 5 }} />);
        const bar = screen.getByRole("img", { name: "20 allowed, 5 asked, 5 blocked" });
        // 30 cells of 5px with 2px gaps
        expect(bar.getAttribute("width")).toBe("208");
        expect(bar.getAttribute("height")).toBe("5");
        expect(cellCount(pathByFill(container, ALLOWED))).toBe(20);
        expect(cellCount(pathByFill(container, ASKED))).toBe(5);
        expect(cellCount(pathByFill(container, BLOCKED))).toBe(5);
        expect(cellCount(pathByFill(container, EMPTY))).toBe(0);
    });

    it("keeps the order allowed, asked, then blocked", () => {
        const { container } = render(<OutcomeBar counts={{ allowed: 1, asked: 1, blocked: 1 }} cells={3} />);
        expect(pathByFill(container, ALLOWED)?.getAttribute("d")).toBe("M0 0h5v5h-5z");
        expect(pathByFill(container, ASKED)?.getAttribute("d")).toBe("M7 0h5v5h-5z");
        expect(pathByFill(container, BLOCKED)?.getAttribute("d")).toBe("M14 0h5v5h-5z");
    });

    it("gives the largest outcome the most cells when shares are close", () => {
        // Exact shares are 0.9, 1.5 and 1.6
        const { container } = render(<OutcomeBar counts={{ allowed: 9, asked: 15, blocked: 16 }} cells={4} />);
        expect(cellCount(pathByFill(container, ALLOWED))).toBe(1);
        expect(cellCount(pathByFill(container, ASKED))).toBe(1);
        expect(cellCount(pathByFill(container, BLOCKED))).toBe(2);
    });

    it("shows an empty row and says so before any decision", () => {
        const { container } = render(<OutcomeBar counts={{ allowed: 0, asked: 0, blocked: 0 }} cells={10} />);
        expect(screen.getByRole("img", { name: "No guard decisions yet" }).getAttribute("width")).toBe("68");
        expect(cellCount(pathByFill(container, EMPTY))).toBe(10);
        expect(cellCount(pathByFill(container, ALLOWED))).toBe(0);
    });
});
