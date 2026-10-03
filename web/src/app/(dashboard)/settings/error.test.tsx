import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsError from "./error";

describe("SettingsError", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says settings could not load and nothing changed, logs it and tries again", () => {
        const error = new Error("settings failed");
        const retry = vi.fn();
        render(<SettingsError error={error} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Could not load settings. Nothing was changed.");
        expect(console.error).toHaveBeenCalledWith(error);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
