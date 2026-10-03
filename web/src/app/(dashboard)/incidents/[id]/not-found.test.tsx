import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IncidentNotFound from "./not-found";

describe("IncidentNotFound", () => {
    it("says why the incident may be missing and links to all incidents", () => {
        render(<IncidentNotFound />);
        expect(screen.getByRole("heading", { level: 1, name: "Incident not found" })).toBeTruthy();
        expect(screen.getByRole("heading", { level: 3, name: "No incident with this id" })).toBeTruthy();
        expect(screen.getByText("It may have been removed by retention, or the link is wrong.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "All incidents" }).getAttribute("href")).toBe("/incidents");
    });
});
