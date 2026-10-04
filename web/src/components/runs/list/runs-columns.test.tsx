import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RUNS_COLUMNS, RunsColgroup, RunsHead } from "./runs-columns";

describe("runs columns", () => {
    it("gives every column a width, with a fixed one for the decision bars", () => {
        const { container } = render(
            <table>
                <RunsColgroup />
            </table>,
        );
        const widths = [...container.querySelectorAll("col")].map((col) => col.style.width);
        expect(widths).toHaveLength(RUNS_COLUMNS);
        expect(widths[3]).toBe("230px");
    });

    it("heads the run column across the selection cell", () => {
        render(
            <table>
                <RunsHead />
            </table>,
        );
        const headers = screen.getAllByRole("columnheader");
        expect(headers.map((th) => th.textContent)).toEqual([
            "Run",
            "Status",
            "Guard decisions",
            "Cost",
            "Spend",
            "Duration",
            "Started",
        ]);
        expect(headers[0].getAttribute("colspan")).toBe("2");
    });
});
