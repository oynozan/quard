import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentsLoading from "./loading";

describe("IncidentsLoading", () => {
    it("keeps the heading and table columns over six loading rows", () => {
        const { container } = render(<IncidentsLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Incidents" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading incidents…");
        const columns = [...container.querySelectorAll("th")].map((th) => th.textContent);
        expect(columns).toEqual(["Incident", "Category", "Entry point", "Damage", "Agents", "Replay", "Opened"]);
        expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    });
});
