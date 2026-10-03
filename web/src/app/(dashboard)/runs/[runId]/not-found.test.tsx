import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RunNotFound from "./not-found";

describe("RunNotFound", () => {
    it("explains what a run id looks like and links back to runs", () => {
        render(<RunNotFound />);
        expect(screen.getByRole("heading", { level: 1, name: "Run not found" })).toBeTruthy();
        expect(screen.getByText("Check the link. A run id is 32 hex characters.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Back to runs" }).getAttribute("href")).toBe("/runs");
    });
});
