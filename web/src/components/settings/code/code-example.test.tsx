import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeExample } from "./code-example";

describe("CodeExample", () => {
    it("starts closed with the sample hidden", () => {
        const { container } = render(<CodeExample code="guard(fn)" />);
        const toggle = screen.getByRole("button", { name: "Show example" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        const sample = container.querySelector("pre") as HTMLElement;
        expect(sample.hidden).toBe(true);
        expect(toggle.getAttribute("aria-controls")).toBe(sample.id);
    });

    it("opens to show the sample, and closes again", () => {
        const { container } = render(<CodeExample code="guard(fn)" />);
        fireEvent.click(screen.getByRole("button", { name: "Show example" }));
        const sample = container.querySelector("pre") as HTMLElement;
        expect(sample.hidden).toBe(false);
        expect(sample.textContent).toBe("guard(fn)");
        const toggle = screen.getByRole("button", { name: "Hide example" });
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        fireEvent.click(toggle);
        expect(sample.hidden).toBe(true);
        expect(screen.getByRole("button", { name: "Show example" })).toBeTruthy();
    });
});
