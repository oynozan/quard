import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentError from "./error";

describe("AgentError", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says the agent could not load, with a way back and a retry", () => {
        const error = new Error("agent failed");
        const retry = vi.fn();
        render(<AgentError error={error} retry={retry} />);
        const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(breadcrumb.querySelector("a")!.getAttribute("href")).toBe("/agents");
        expect(screen.getByRole("heading", { level: 1, name: "Agent" })).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Could not load this agent.");
        expect(console.error).toHaveBeenCalledWith(error);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
