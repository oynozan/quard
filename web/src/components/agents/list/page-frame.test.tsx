import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentsGrid, PageFrame } from "./page-frame";

describe("PageFrame", () => {
    it("marks the page busy while it loads", () => {
        render(<PageFrame busy>Loading</PageFrame>);
        expect(screen.getByText("Loading").getAttribute("aria-busy")).toBe("true");
    });

    it("leaves out aria-busy once the page is ready", () => {
        render(<PageFrame>Ready</PageFrame>);
        expect(screen.getByText("Ready").hasAttribute("aria-busy")).toBe(false);
    });
});

describe("AgentsGrid", () => {
    it("puts the graph and the roster in one grid that stacks on narrow screens", () => {
        render(
            <AgentsGrid>
                <section aria-label="Graph" />
                <section aria-label="Roster" />
            </AgentsGrid>,
        );
        const grid = screen.getByRole("region", { name: "Graph" }).parentElement as HTMLElement;
        expect(screen.getByRole("region", { name: "Roster" }).parentElement).toBe(grid);
        expect(grid.classList.contains("grid")).toBe(true);
        expect(grid.classList.contains("max-[980px]:grid-cols-1")).toBe(true);
    });
});
