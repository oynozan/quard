import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunsNoMatch } from "./runs-states";

describe("RunsNoMatch", () => {
    it("says nothing matches and offers to clear the filters, with no empty table", () => {
        render(<RunsNoMatch />);
        expect(screen.getByRole("status").textContent).toBe("No runs matchClear filters");
        expect(screen.getByRole("heading", { level: 3, name: "No runs match" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/runs");
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.queryByRole("columnheader")).toBeNull();
    });
});
