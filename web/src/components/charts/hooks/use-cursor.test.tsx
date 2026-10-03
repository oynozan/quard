import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCursor, useGridCursor } from "./use-cursor";

function Cursor({ count, start }: { count: number; start?: "first" | "last" }) {
    const cursor = useCursor(count, start);
    return (
        <div role="group" aria-label="Chart" tabIndex={0} onKeyDown={cursor.onKeyDown}>
            <output>{cursor.index ?? "none"}</output>
            <button type="button" onClick={() => cursor.setIndex(2)}>
                Hover 2
            </button>
            <button type="button" onClick={cursor.clear}>
                Leave
            </button>
        </div>
    );
}

function GridCursor({ rows, cols }: { rows: number; cols: number }) {
    const cursor = useGridCursor(rows, cols);
    return (
        <div role="grid" aria-label="Heatmap" tabIndex={0} onKeyDown={cursor.onKeyDown}>
            <output>{cursor.cell ? `${cursor.cell.row},${cursor.cell.col}` : "none"}</output>
            <button type="button" onClick={() => cursor.setCell({ row: 1, col: 3 })}>
                Hover 1,3
            </button>
            <button type="button" onClick={cursor.clear}>
                Leave
            </button>
        </div>
    );
}

// Returns false when the key's default action was prevented
const press = (el: HTMLElement, key: string) => fireEvent.keyDown(el, { key });
const shown = () => screen.getByRole("status").textContent;

describe("useCursor", () => {
    it("has no mark picked at first", () => {
        render(<Cursor count={5} />);
        expect(shown()).toBe("none");
    });

    it("lands the first arrow on the newest mark, then steps back and forth", () => {
        render(<Cursor count={5} />);
        const chart = screen.getByRole("group", { name: "Chart" });
        expect(press(chart, "ArrowRight")).toBe(false);
        expect(shown()).toBe("4");
        press(chart, "ArrowLeft");
        press(chart, "ArrowUp");
        expect(shown()).toBe("2");
        press(chart, "ArrowDown");
        expect(shown()).toBe("3");
    });

    it("lands the first arrow on the top mark when ranked from the first", () => {
        render(<Cursor count={5} start="first" />);
        const chart = screen.getByRole("group", { name: "Chart" });
        press(chart, "ArrowLeft");
        expect(shown()).toBe("0");
    });

    it("stops at either end", () => {
        render(<Cursor count={3} start="first" />);
        const chart = screen.getByRole("group", { name: "Chart" });
        press(chart, "ArrowUp");
        press(chart, "ArrowUp");
        expect(shown()).toBe("0");
        press(chart, "End");
        press(chart, "ArrowRight");
        expect(shown()).toBe("2");
    });

    it("jumps to the first and last mark with Home and End", () => {
        render(<Cursor count={5} />);
        const chart = screen.getByRole("group", { name: "Chart" });
        expect(press(chart, "Home")).toBe(false);
        expect(shown()).toBe("0");
        press(chart, "End");
        expect(shown()).toBe("4");
    });

    it("lets go with Escape without blocking the key", () => {
        render(<Cursor count={5} />);
        const chart = screen.getByRole("group", { name: "Chart" });
        press(chart, "End");
        expect(press(chart, "Escape")).toBe(true);
        expect(shown()).toBe("none");
    });

    it("ignores other keys and leaves them to the page", () => {
        render(<Cursor count={5} />);
        const chart = screen.getByRole("group", { name: "Chart" });
        expect(press(chart, "Tab")).toBe(true);
        expect(shown()).toBe("none");
    });

    it("ignores every key when there are no marks", () => {
        render(<Cursor count={0} />);
        const chart = screen.getByRole("group", { name: "Chart" });
        expect(press(chart, "ArrowLeft")).toBe(true);
        expect(press(chart, "Escape")).toBe(true);
        expect(shown()).toBe("none");
    });

    it("follows hover and clears when the pointer leaves", () => {
        render(<Cursor count={5} />);
        fireEvent.click(screen.getByRole("button", { name: "Hover 2" }));
        expect(shown()).toBe("2");
        fireEvent.click(screen.getByRole("button", { name: "Leave" }));
        expect(shown()).toBe("none");
    });

    it("drops a mark that no longer exists after the data shrinks", () => {
        const { rerender } = render(<Cursor count={5} />);
        fireEvent.click(screen.getByRole("button", { name: "Hover 2" }));
        rerender(<Cursor count={2} />);
        expect(shown()).toBe("none");
        // Arrows start over from the newest mark
        press(screen.getByRole("group", { name: "Chart" }), "ArrowLeft");
        expect(shown()).toBe("1");
    });
});

describe("useGridCursor", () => {
    it("lands the first arrow on the bottom right cell", () => {
        render(<GridCursor rows={3} cols={4} />);
        const grid = screen.getByRole("grid", { name: "Heatmap" });
        expect(shown()).toBe("none");
        expect(press(grid, "ArrowUp")).toBe(false);
        expect(shown()).toBe("2,3");
    });

    it("moves one cell per arrow in each direction", () => {
        render(<GridCursor rows={3} cols={4} />);
        const grid = screen.getByRole("grid", { name: "Heatmap" });
        press(grid, "ArrowLeft");
        press(grid, "ArrowLeft");
        expect(shown()).toBe("2,2");
        press(grid, "ArrowUp");
        expect(shown()).toBe("1,2");
        press(grid, "ArrowRight");
        expect(shown()).toBe("1,3");
        press(grid, "ArrowDown");
        expect(shown()).toBe("2,3");
    });

    it("stays inside the grid at the edges", () => {
        render(<GridCursor rows={2} cols={2} />);
        const grid = screen.getByRole("grid", { name: "Heatmap" });
        press(grid, "ArrowDown");
        press(grid, "ArrowDown");
        press(grid, "ArrowRight");
        expect(shown()).toBe("1,1");
        press(grid, "ArrowUp");
        press(grid, "ArrowUp");
        press(grid, "Home");
        press(grid, "ArrowLeft");
        expect(shown()).toBe("0,0");
    });

    it("jumps within the row with Home and End", () => {
        render(<GridCursor rows={3} cols={4} />);
        const grid = screen.getByRole("grid", { name: "Heatmap" });
        press(grid, "ArrowUp");
        press(grid, "ArrowUp");
        press(grid, "Home");
        expect(shown()).toBe("1,0");
        press(grid, "End");
        expect(shown()).toBe("1,3");
    });

    it("lets go with Escape and ignores other keys", () => {
        render(<GridCursor rows={3} cols={4} />);
        const grid = screen.getByRole("grid", { name: "Heatmap" });
        press(grid, "End");
        expect(press(grid, "Enter")).toBe(true);
        expect(shown()).toBe("2,3");
        expect(press(grid, "Escape")).toBe(true);
        expect(shown()).toBe("none");
    });

    it("ignores every key when the grid has no rows or no columns", () => {
        const { rerender } = render(<GridCursor rows={0} cols={4} />);
        const grid = () => screen.getByRole("grid", { name: "Heatmap" });
        expect(press(grid(), "ArrowUp")).toBe(true);
        rerender(<GridCursor rows={3} cols={0} />);
        expect(press(grid(), "ArrowUp")).toBe(true);
        expect(shown()).toBe("none");
    });

    it("follows hover and clears when the pointer leaves", () => {
        render(<GridCursor rows={3} cols={4} />);
        fireEvent.click(screen.getByRole("button", { name: "Hover 1,3" }));
        expect(shown()).toBe("1,3");
        fireEvent.click(screen.getByRole("button", { name: "Leave" }));
        expect(shown()).toBe("none");
    });

    it("drops a cell outside the grid after its rows or columns shrink", () => {
        const { rerender } = render(<GridCursor rows={3} cols={4} />);
        fireEvent.click(screen.getByRole("button", { name: "Hover 1,3" }));
        rerender(<GridCursor rows={1} cols={4} />);
        expect(shown()).toBe("none");
        rerender(<GridCursor rows={3} cols={3} />);
        expect(shown()).toBe("none");
        rerender(<GridCursor rows={3} cols={4} />);
        expect(shown()).toBe("1,3");
    });
});
