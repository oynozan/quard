import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LabelsError from "./error";

describe("LabelsError", () => {
    it("says labels could not load, that no review was lost, and tries again", () => {
        const retry = vi.fn();
        render(<LabelsError error={new Error("down")} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Labels" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Labels could not be loaded.");
        expect(alert.textContent).toContain("No review was lost.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
