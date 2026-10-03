import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, NameCell, TableState, Td, Th, Tr } from "./data-table";

describe("DataTable", () => {
    it("lays out header and body cells, with column headers scoped to their column", () => {
        render(
            <DataTable className="extra">
                <thead>
                    <tr>
                        <Th>Agent</Th>
                    </tr>
                </thead>
                <tbody>
                    <Tr>
                        <Td>billing-bot</Td>
                    </Tr>
                </tbody>
            </DataTable>,
        );
        const table = screen.getByRole("table");
        expect(table.style.minWidth).toBe("680px");
        expect(table.className).toContain("extra");
        expect(screen.getByRole("columnheader", { name: "Agent" }).getAttribute("scope")).toBe("col");
        expect(screen.getByRole("cell", { name: "billing-bot" })).toBeTruthy();
    });

    it("keeps a custom minimum width so narrow screens scroll", () => {
        render(
            <DataTable minWidth={900}>
                <tbody />
            </DataTable>,
        );
        expect(screen.getByRole("table").style.minWidth).toBe("900px");
    });
});

describe("Tr", () => {
    it("gives only rows that open something a pointer", () => {
        render(
            <table>
                <tbody>
                    <Tr interactive>
                        <td>open</td>
                    </Tr>
                    <Tr>
                        <td>static</td>
                    </Tr>
                </tbody>
            </table>,
        );
        const [open, still] = screen.getAllByRole("row");
        expect(open.className).toContain("cursor-pointer");
        expect(still.className).not.toContain("cursor-pointer");
    });
});

describe("NameCell", () => {
    it("shows the icon tile, the name and the identifier under it", () => {
        const { container } = render(<NameCell icon={<svg data-testid="icon" />} name="billing-bot" sub="ag_123" />);
        expect(screen.getByTestId("icon")).toBeTruthy();
        expect(container.querySelector("strong")?.textContent).toBe("billing-bot");
        expect(container.querySelector("small")?.textContent).toBe("ag_123");
    });

    it("shows only the name when there is no icon or identifier, in mono when asked", () => {
        const { container } = render(<NameCell name="run_42" mono />);
        expect(container.querySelector("small")).toBeNull();
        expect(container.querySelector("strong")?.className).toContain("mono");
        expect(container.textContent).toBe("run_42");
    });
});

describe("TableState", () => {
    it("shows a heading, a sentence and one action", () => {
        render(
            <TableState
                title="No matches"
                body="Try another search."
                action={<button type="button">Clear filters</button>}
            />,
        );
        expect(screen.getByRole("heading", { level: 3, name: "No matches" })).toBeTruthy();
        expect(screen.getByText("Try another search.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    });

    it("leaves out the sentence when there is none", () => {
        const { container } = render(<TableState title="Nothing here" />);
        expect(container.querySelector("p")).toBeNull();
    });
});
