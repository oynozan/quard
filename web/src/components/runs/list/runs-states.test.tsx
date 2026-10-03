import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunsEmpty, RunsNoMatch } from "./runs-states";

function headers(): string[] {
    return screen.getAllByRole("columnheader").map((header) => header.textContent ?? "");
}

describe("RunsEmpty", () => {
    it("keeps the header row and says there are no runs yet under it", () => {
        render(<RunsEmpty />);
        expect(headers()).toEqual(["Run", "Status", "Guard decisions", "Cost", "Duration", "Started"]);
        expect(screen.getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toBe("No runs yet");
        expect(screen.getByRole("heading", { level: 3, name: "No runs yet" })).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("RunsNoMatch", () => {
    it("keeps the header row, says nothing matches and offers to clear the filters", () => {
        render(<RunsNoMatch />);
        expect(headers()).toHaveLength(6);
        expect(screen.getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("status").textContent).toBe("No runs matchClear filters");
        expect(screen.getByRole("heading", { level: 3, name: "No runs match" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/runs");
    });
});
