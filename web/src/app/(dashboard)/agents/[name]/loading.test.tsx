import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentLoading from "./loading";

describe("AgentLoading", () => {
    it("tells screen readers the agent is loading while its panes keep their headers", () => {
        const { container } = render(<AgentLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading agent…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
        expect(container.textContent).toContain("Recent calls");
        expect(container.textContent).toContain("Permissions");
    });
});
