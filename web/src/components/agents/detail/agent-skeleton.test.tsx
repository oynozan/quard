import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentSkeleton } from "./agent-skeleton";

describe("AgentSkeleton", () => {
    it("tells screen readers the agent is loading and marks the page busy", () => {
        const { container } = render(<AgentSkeleton />);
        expect(screen.getByRole("status").textContent).toBe("Loading agent…");
        expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    });

    it("keeps the pane headers, hidden from screen readers", () => {
        render(<AgentSkeleton />);
        expect(screen.queryByRole("heading")).toBeNull();
        const headings = screen.getAllByRole("heading", { hidden: true }).map((item) => item.textContent);
        expect(headings).toEqual(["Recent calls", "Permissions"]);
    });

    it("holds a place for the two permission blocks", () => {
        render(<AgentSkeleton />);
        const pane = screen.getByRole("heading", { hidden: true, name: "Permissions" }).closest("section");
        expect(pane?.querySelectorAll(":scope > div")).toHaveLength(2);
    });
});
