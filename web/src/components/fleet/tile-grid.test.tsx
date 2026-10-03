import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TileGrid } from "./tile-grid";

describe("TileGrid", () => {
    it("lays out its panes and adds the caller's column classes", () => {
        render(
            <TileGrid className="grid-cols-2">
                <p>First pane</p>
                <p>Second pane</p>
            </TileGrid>,
        );
        const grid = screen.getByText("First pane").parentElement;
        expect(grid?.children).toHaveLength(2);
        expect(grid?.className.split(" ")).toEqual(expect.arrayContaining(["grid", "gap-px", "grid-cols-2"]));
    });
});
