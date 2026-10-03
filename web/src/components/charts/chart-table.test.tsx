import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartTable, type ChartTableColumn } from "./chart-table";

const COLUMNS: ChartTableColumn[] = [{ label: "Day" }, { label: "Calls" }, { label: "Agent", align: "left" }];

describe("ChartTable", () => {
    it("lists the rows under a caption, with the first cell as the row header", () => {
        const { container } = render(
            <ChartTable
                caption="Calls per day"
                height={180}
                columns={COLUMNS}
                rows={[
                    { key: "a", cells: ["1 May", "120", "planner"] },
                    { key: "b", cells: ["2 May", "98", "coder"] },
                ]}
            />,
        );
        expect(screen.getByRole("table", { name: "Calls per day" })).toBeTruthy();
        expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Day", "Calls", "Agent"]);
        expect(screen.getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["1 May", "2 May"]);
        expect(screen.getAllByRole("cell").map((td) => td.textContent)).toEqual(["120", "planner", "98", "coder"]);
        expect((container.firstElementChild as HTMLElement).style.height).toBe("180px");
        expect(screen.queryByText("No data")).toBeNull();
    });

    it("aligns the first column left and the rest right unless told otherwise", () => {
        render(
            <ChartTable
                caption="Calls"
                height={100}
                columns={COLUMNS}
                rows={[{ key: "a", cells: ["1 May", "120", "planner", "extra"] }]}
            />,
        );
        const [day, calls, agent] = screen.getAllByRole("columnheader");
        expect(day.className).not.toContain("text-right");
        expect(calls.className).toContain("text-right");
        expect(agent.className).not.toContain("text-right");
        const [count, name, extra] = screen.getAllByRole("cell");
        expect(count.className).toContain("text-right");
        expect(name.className).not.toContain("text-right");
        // A cell past the last column falls back to right alignment
        expect(extra.className).toContain("text-right");
    });

    it("says there is no data when there are no rows", () => {
        render(<ChartTable caption="Calls" height={100} columns={COLUMNS} rows={[]} />);
        expect(screen.getByText("No data")).toBeTruthy();
        expect(screen.queryAllByRole("rowheader")).toHaveLength(0);
    });

    it("uses its own empty text when given one", () => {
        render(<ChartTable caption="Calls" height={100} columns={COLUMNS} rows={[]} emptyText="No calls yet" />);
        expect(screen.getByText("No calls yet")).toBeTruthy();
    });
});
