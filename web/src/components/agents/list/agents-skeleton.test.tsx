import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentsSkeleton } from "./agents-skeleton";

describe("AgentsSkeleton", () => {
    it("tells screen readers the agents are loading and marks the page busy", () => {
        const { container } = render(<AgentsSkeleton />);
        expect(screen.getByRole("status").textContent).toBe("Loading agents…");
        expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    });

    it("keeps the graph and roster headers, hidden from screen readers", () => {
        render(<AgentsSkeleton />);
        expect(screen.queryByRole("heading")).toBeNull();
        const headings = screen.getAllByRole("heading", { hidden: true }).map((item) => item.textContent);
        expect(headings).toEqual(["Agent graph", "Agents"]);
        expect(screen.getByText("30D")).toBeTruthy();
    });
});
