import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuardMark, QuardWordmark } from "./quard-mark";

describe("QuardMark", () => {
    it("draws four cells with one lit, 2px apart", () => {
        const { container } = render(<QuardMark size={14} />);
        const cells = [...container.querySelectorAll("rect")];
        expect(cells.map((cell) => cell.getAttribute("fill"))).toEqual([
            "var(--signal)",
            "var(--ink)",
            "var(--ink)",
            "var(--ink-subtle)",
        ]);
        expect(cells[1]?.getAttribute("x")).toBe("8");
        expect(cells[0]?.getAttribute("width")).toBe("6");
    });

    it("defaults to 18px and stays hidden from screen readers", () => {
        const { container } = render(<QuardMark />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("width")).toBe("18");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
});

describe("QuardWordmark", () => {
    it("names the product and the docs", () => {
        render(<QuardWordmark />);
        expect(screen.getByText("quard")).toBeTruthy();
        expect(screen.getByText("docs")).toBeTruthy();
    });
});
