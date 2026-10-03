import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunsError from "./error";

describe("RunsError", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says runs could not load without a count, logs the error and tries again", () => {
        const error = new Error("db down");
        const retry = vi.fn();
        render(<RunsError error={error} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Runs");
        expect(screen.getByRole("alert").textContent).toContain("Could not load runs.");
        expect(console.error).toHaveBeenCalledWith(error);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
