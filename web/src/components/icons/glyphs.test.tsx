import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrossGlyph, Glyph, WarningGlyph } from "./glyphs";

function svgOf(container: HTMLElement) {
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("no svg drawn");
    return svg;
}

describe("Glyph", () => {
    it("draws the named path on the 48-unit grid, hidden from screen readers", () => {
        const svg = svgOf(render(<Glyph name="check" />).container);
        expect(svg.getAttribute("aria-hidden")).toBe("true");
        expect(svg.getAttribute("viewBox")).toBe("0 0 48 48");
        expect(svg.getAttribute("width")).toBe("16");
        expect(svg.getAttribute("stroke-width")).toBe("1.5");
        expect(svg.querySelector("path")?.getAttribute("d")).toBe("m12 24 8 8 16-16");
    });

    it("takes a size, a stroke and extra svg props", () => {
        const svg = svgOf(render(<Glyph name="copy" size={20} strokeWidth={1} className="ml-2" />).container);
        expect(svg.getAttribute("height")).toBe("20");
        expect(svg.getAttribute("stroke-width")).toBe("1");
        expect(svg.getAttribute("class")).toBe("ml-2");
    });
});

describe("status glyphs", () => {
    it("draws the warning sign with a heavier stroke", () => {
        const svg = svgOf(render(<WarningGlyph className="text-caution" />).container);
        expect(svg.getAttribute("stroke-width")).toBe("2.2");
        expect(svg.getAttribute("width")).toBe("14");
        expect(svg.getAttribute("class")).toBe("text-caution");
        expect(svg.querySelector("path")?.getAttribute("d")).toBe("M24 8L43 40H5ZM24 19V29M24 34V35");
    });

    it("draws the cross at the size asked for", () => {
        const svg = svgOf(render(<CrossGlyph size={10} />).container);
        expect(svg.getAttribute("width")).toBe("10");
        expect(svg.getAttribute("stroke-width")).toBe("2.2");
        expect(svg.querySelector("path")?.getAttribute("d")).toBe("M15 15L33 33M33 15L15 33");
    });
});
