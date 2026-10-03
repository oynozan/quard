import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RunError from "./error";

describe("RunError", () => {
    it("says the run could not load, that the data is safe, and tries again", () => {
        const retry = vi.fn();
        render(<RunError error={new Error("down")} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Run" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("This run could not be loaded.");
        expect(alert.textContent).toContain("Your data is safe. Try again, or come back in a minute.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
