import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentsLoading from "./loading";

describe("AgentsLoading", () => {
    it("tells screen readers the agents are loading while the graph and roster keep their panes", () => {
        const { container } = render(<AgentsLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading agents…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
        expect(container.textContent).toContain("Agent graph");
    });
});
