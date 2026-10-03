import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuardMark, QuardWordmark } from "./quard-mark";

describe("QuardMark", () => {
    it("draws four cells with only the top-left one lit", () => {
        const { container } = render(<QuardMark size={22} />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(svg?.getAttribute("viewBox")).toBe("0 0 22 22");
        const rects = [...container.querySelectorAll("rect")];
        expect(rects.map((rect) => rect.getAttribute("fill"))).toEqual([
            "var(--signal)",
            "var(--ink)",
            "var(--ink)",
            "var(--ink-subtle)",
        ]);
        // Each cell is half the size less the 2px gap
        expect(rects[3].getAttribute("x")).toBe("12");
        expect(rects[3].getAttribute("width")).toBe("10");
    });
});

describe("QuardWordmark", () => {
    it("shows the 18px mark beside the product name", () => {
        const { container } = render(<QuardWordmark />);
        expect(screen.getByText("quard")).toBeTruthy();
        expect(container.querySelector("svg")?.getAttribute("width")).toBe("18");
    });
});
