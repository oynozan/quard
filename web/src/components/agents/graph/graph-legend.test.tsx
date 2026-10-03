import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphLegend } from "./graph-legend";

describe("GraphLegend", () => {
    it("names the two agent states, with no offline one while connections are not recorded", () => {
        render(<GraphLegend />);
        expect(screen.getByText("Agents")).toBeTruthy();
        expect(screen.getByText("Running")).toBeTruthy();
        expect(screen.getByText("Idle")).toBeTruthy();
        expect(screen.queryByText("Offline")).toBeNull();
    });

    it("shows a line for each untrusted share bucket, dashing only the top one", () => {
        const { container } = render(<GraphLegend />);
        expect(screen.getByText("Untrusted")).toBeTruthy();
        expect(screen.getByText("<10%")).toBeTruthy();
        expect(screen.getByText("10–59%")).toBeTruthy();
        expect(screen.getByText("60%+")).toBeTruthy();
        const lines = [...container.querySelectorAll("line")];
        expect(lines.map((line) => line.getAttribute("stroke"))).toEqual([
            "var(--chart-context)",
            "var(--cat-3)",
            "var(--caution-text)",
        ]);
        expect(lines.map((line) => line.getAttribute("stroke-dasharray"))).toEqual([null, null, "7 4"]);
    });
});
