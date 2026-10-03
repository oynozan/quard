import { screen, within } from "@testing-library/react";
import { expect } from "vitest";

// Any path in a color other than the unlit field is a lit cell
function litPaths(root: HTMLElement): Element[] {
    return [...root.querySelectorAll("path")].filter(
        (path) => path.getAttribute("fill") !== "var(--chart-field)" && path.getAttribute("d"),
    );
}

// Fails unless the chart pane keeps its frame with nothing lit and the empty text knocked out of the field
export function expectEmptyChart(name: string, text: string): HTMLElement {
    const pane = screen.getByRole("region", { name });
    const scope = within(pane);

    expect(scope.getByRole("heading", { level: 2 }).textContent).toBe(name);
    expect(scope.getByRole("button", { name: "Table" })).toBeTruthy();
    expect(scope.getByRole("img").getAttribute("aria-label")).toBe(text);
    expect(scope.getByText(text)).toBeTruthy();
    expect(litPaths(pane)).toHaveLength(0);
    expect(pane.hasAttribute("aria-busy")).toBe(false);
    return pane;
}

// Fails unless the table keeps its header row, has no other rows and shows the empty line under it
export function expectEmptyTable(root: HTMLElement, headers: string[], text: string): void {
    const scope = within(root);

    expect(scope.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(headers);
    expect(scope.getAllByRole("row")).toHaveLength(1);
    expect(scope.getByRole("status").textContent).toBe(text);
}
