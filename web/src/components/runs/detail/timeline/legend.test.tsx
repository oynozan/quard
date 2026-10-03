import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UNTRUSTED_PUBLIC, makeGuard, makeStep } from "../../../../../test/runs-timeline-lib/steps";
import { TimelineLegend } from "./legend";

// The visible words of the legend, in order
function entries(container: HTMLElement): string[] {
    return [...container.querySelectorAll(":scope > div > span:not(.sr-only)")]
        .map((span) => span.textContent ?? "")
        .filter(Boolean);
}

describe("TimelineLegend", () => {
    it("lists the four contexts and no marks for a run without blocks or waits", () => {
        const { container } = render(<TimelineLegend steps={[makeStep(), makeStep({ context: UNTRUSTED_PUBLIC })]} />);
        expect(screen.getByText("Legend:").className).toBe("sr-only");
        expect(entries(container)).toEqual([
            "Trusted public",
            "Trusted internal",
            "Untrusted public",
            "Untrusted internal",
        ]);
        expect(container.querySelector(".bg-line")).toBeNull();
    });

    it("colors each context swatch and cuts a hole into untrusted ones only", () => {
        render(<TimelineLegend steps={[]} />);
        const fill = (word: string) => screen.getByText(word).querySelector("svg rect")?.getAttribute("fill");
        expect(fill("Trusted public")).toBe("var(--chart-context)");
        expect(fill("Untrusted internal")).toBe("var(--cat-3)");
        const hole = (word: string) => screen.getByText(word).querySelectorAll("svg rect")[1] ?? null;
        expect(hole("Trusted public")).toBeNull();
        expect(hole("Trusted internal")).toBeNull();
        expect(hole("Untrusted public")?.getAttribute("fill")).toBe("var(--page)");
        expect(hole("Untrusted internal")?.getAttribute("fill")).toBe("var(--page)");
    });

    it("adds the marks this run has, in a fixed order after a divider", () => {
        const steps = [
            makeStep({ guard: makeGuard({ outcome: "ask", mode: "observe" }) }),
            makeStep({ status: "waiting" }),
            makeStep({ status: "error" }),
            makeStep({ status: "blocked" }),
        ];
        const { container } = render(<TimelineLegend steps={steps} />);
        expect(entries(container).slice(4)).toEqual(["Blocked or failed", "Waiting for a human", "Would ask"]);
        expect(container.querySelector(".bg-line")).toBeTruthy();
    });

    it("draws solid swatches for enforced marks and outlines for observe mode", () => {
        const steps = [
            makeStep({ guard: makeGuard({ outcome: "block" }) }),
            makeStep({ status: "waiting" }),
            makeStep({ guard: makeGuard({ outcome: "block", mode: "observe" }) }),
            makeStep({ guard: makeGuard({ outcome: "ask", mode: "observe" }) }),
        ];
        render(<TimelineLegend steps={steps} />);
        const swatch = (word: string) => screen.getByText(word).querySelector("rect");
        expect(swatch("Blocked or failed")?.getAttribute("fill")).toBe("var(--danger)");
        expect(swatch("Waiting for a human")?.getAttribute("fill")).toBe("var(--warning)");
        const wouldBlock = swatch("Would block");
        expect(wouldBlock?.getAttribute("fill")).toBe("none");
        expect(wouldBlock?.getAttribute("stroke")).toBe("var(--danger)");
        expect(swatch("Would ask")?.getAttribute("stroke")).toBe("var(--warning)");
    });
});
