import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutcomeLegend } from "./outcome-legend";

describe("OutcomeLegend", () => {
    it("names the three guard decision colors in bar order", () => {
        render(<OutcomeLegend />);
        const list = screen.getByRole("list", { name: "Guard decision colors" });
        expect(
            within(list)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual(["Allowed", "Asked", "Blocked"]);
    });

    it("pairs each word with the matching bar color", () => {
        render(<OutcomeLegend />);
        const squares = screen.getAllByRole("listitem").map((item) => item.querySelector("span")?.className ?? "");
        expect(squares.map((name) => name.match(/bg-\S+/)?.[0])).toEqual([
            "bg-chart-context",
            "bg-warning",
            "bg-danger",
        ]);
    });
});
