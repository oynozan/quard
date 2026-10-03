import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ApprovalsError from "./error";

describe("ApprovalsError", () => {
    it("says approvals could not load, that no answer was lost, and tries again", () => {
        const retry = vi.fn();
        render(<ApprovalsError error={new Error("down")} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Approvals could not be loaded.");
        expect(alert.textContent).toContain("Open requests keep waiting. No answer was lost.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
