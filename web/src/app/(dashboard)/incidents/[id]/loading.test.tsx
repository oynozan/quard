import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentLoading from "./loading";

describe("IncidentLoading", () => {
    it("tells screen readers the incident is loading", () => {
        const { container } = render(<IncidentLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading the incident…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    });

    it("draws a title bar and one small bar, with no path, replay or verdict skeletons", () => {
        const { container } = render(<IncidentLoading />);
        expect(container.querySelectorAll(".skel")).toHaveLength(2);
        expect(container.querySelectorAll("[class*='border']")).toHaveLength(0);
    });
});
