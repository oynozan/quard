import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitHubMark } from "./github-mark";

describe("GitHubMark", () => {
    it("draws a hidden 16px mark by default", () => {
        const { container } = render(<GitHubMark />);
        const svg = container.querySelector("svg")!;
        expect(svg.getAttribute("aria-hidden")).toBe("true");
        expect(svg.getAttribute("width")).toBe("16");
        expect(svg.getAttribute("height")).toBe("16");
    });

    it("draws at the size asked for", () => {
        const { container } = render(<GitHubMark size={20} />);
        expect(container.querySelector("svg")!.getAttribute("width")).toBe("20");
    });
});
