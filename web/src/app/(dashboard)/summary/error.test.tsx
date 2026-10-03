import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SummaryError from "./error";

describe("SummaryError", () => {
    it("says the fleet view could not load, that guards keep running, and resets", () => {
        const reset = vi.fn();
        render(<SummaryError error={new Error("down")} reset={reset} />);
        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("The fleet view could not be loaded.");
        expect(alert.textContent).toContain("Guards keep running.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(reset).toHaveBeenCalledOnce();
    });
});
