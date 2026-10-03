import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure";

describe("Disclosure", () => {
    it("starts closed and opens its content in place on click", () => {
        render(
            <Disclosure label="Setup" className="mt-4">
                <p>Model gpt-6.1</p>
            </Disclosure>,
        );
        const toggle = screen.getByRole("button", { name: "Setup" });
        const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(panel?.hidden).toBe(true);
        expect(panel?.textContent).toBe("Model gpt-6.1");

        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(panel?.hidden).toBe(false);
    });

    it("closes again on a second click", () => {
        render(
            <Disclosure label="Agent versions">
                <p>billing 1.4.0</p>
            </Disclosure>,
        );
        const toggle = screen.getByRole("button", { name: "Agent versions" });
        fireEvent.click(toggle);
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(screen.getByText("billing 1.4.0").parentElement?.hidden).toBe(true);
    });
});
