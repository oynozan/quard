import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentsLoading from "./loading";

describe("IncidentsLoading", () => {
    it("keeps the heading and one small bar, with no toolbar or table", () => {
        const { container } = render(<IncidentsLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading incidents…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
        expect(container.querySelectorAll(".skel")).toHaveLength(1);
        expect(container.querySelector("table")).toBeNull();
    });
});
