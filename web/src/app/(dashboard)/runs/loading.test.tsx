import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RunsLoading from "./loading";

describe("RunsLoading", () => {
    it("keeps the heading without a count while the runs table loads", () => {
        render(<RunsLoading />);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Runs");
        expect(screen.getByRole("status").textContent).toBe("Loading runs…");
        expect(screen.getByRole("table")).toBeTruthy();
    });
});
