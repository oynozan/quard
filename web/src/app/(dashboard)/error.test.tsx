import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OverviewError from "./error";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("OverviewError", () => {
    it("says the overview could not load, logs why, and tries again", () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const retry = vi.fn();
        const error = new Error("DATABASE_URL is not set");
        render(<OverviewError error={error} retry={retry} />);

        expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("The overview could not be loaded.");
        expect(alert.textContent).toContain("Guards keep running.");
        expect(log).toHaveBeenCalledWith(error);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
