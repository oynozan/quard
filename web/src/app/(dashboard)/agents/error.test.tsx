import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentsError from "./error";

describe("AgentsError", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says the graph could not load, logs the error and tries again on request", () => {
        const error = new Error("graph failed");
        const retry = vi.fn();
        render(<AgentsError error={error} retry={retry} />);
        expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Could not load the agent graph.");
        expect(console.error).toHaveBeenCalledWith(error);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
