import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("LabelsLoading", () => {
    it("keeps the heading and the queue columns over skeleton rows", () => {
        const { container } = render(<Loading />);
        expect(screen.getByRole("heading", { level: 1, name: "Labels" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading labels…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
        const columns = [...container.querySelectorAll("th")].map((th) => th.textContent);
        expect(columns).toEqual(["Chunk", "Label", "AI fallback", "Seen", "Actions"]);
        expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
    });
});
