import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentLoading from "./loading";

describe("IncidentLoading", () => {
    it("tells screen readers the incident is loading", () => {
        const { container } = render(<IncidentLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading the incident…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    });
});
