import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IncidentsError from "./error";

describe("IncidentsError", () => {
    it("says incidents could not load, that they are safe, and resets on request", () => {
        const reset = vi.fn();
        render(<IncidentsError error={new Error("down")} reset={reset} />);
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Incidents could not be loaded.");
        expect(alert.textContent).toContain("Your incidents are safe. This only affects loading them.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(reset).toHaveBeenCalledOnce();
    });
});
