import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunsEmpty, RunsNoMatch } from "./runs-states";

describe("RunsEmpty", () => {
    it("keeps the column headers and says there are no runs yet", () => {
        render(<RunsEmpty />);
        expect(screen.getAllByRole("columnheader")).toHaveLength(6);
        expect(screen.getByRole("status").textContent).toBe("No runs yet");
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("RunsNoMatch", () => {
    it("says nothing matches and offers to clear the filters", () => {
        render(<RunsNoMatch />);
        expect(screen.getAllByRole("columnheader")).toHaveLength(6);
        expect(screen.getByRole("heading", { level: 3, name: "No runs match" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/runs");
    });
});
