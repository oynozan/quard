import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuarantineSkeleton } from "./quarantine-skeleton";

describe("QuarantineSkeleton", () => {
    it("keeps the quarantine heading and columns while rows load", () => {
        render(<QuarantineSkeleton />);
        const section = screen.getByRole("region", { name: "Quarantine" });
        expect(section.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByRole("heading", { level: 2, name: "Quarantine" })).toBeTruthy();
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Value", "Agents", "Quarantined", "Blocked", "Last attempt", "Actions"]);
        expect(screen.getByRole("status").textContent).toBe("Loading quarantine…");
        expect(screen.getAllByRole("row")).toHaveLength(4);
    });
});
