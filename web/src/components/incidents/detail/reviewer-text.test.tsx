import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewerText } from "./reviewer-text";

describe("ReviewerText", () => {
    it("shows a single paragraph with no Show more toggle", () => {
        render(<ReviewerText paragraphs={["The IBAN came from the supplier page."]} />);
        expect(screen.getByText("The IBAN came from the supplier page.")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("hides the rest behind Show more and toggles it", () => {
        render(<ReviewerText paragraphs={["First.", "Second.", "Third."]} />);
        const toggle = screen.getByRole("button", { name: "Show more" });
        const rest = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(rest?.hidden).toBe(true);
        expect(rest?.textContent).toBe("Second.Third.");

        fireEvent.click(toggle);
        expect(toggle.textContent).toBe("Show less");
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(rest?.hidden).toBe(false);

        fireEvent.click(toggle);
        expect(toggle.textContent).toBe("Show more");
        expect(rest?.hidden).toBe(true);
    });
});
