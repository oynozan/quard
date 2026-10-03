import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("ApprovalsLoading", () => {
    it("keeps the page heading and says approvals are loading", () => {
        const { container } = render(<Loading />);
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading approvals…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    });

    it("draws one small bar and no cards, sections or table", () => {
        const { container } = render(<Loading />);
        expect(container.querySelectorAll(".skel")).toHaveLength(1);
        expect(container.querySelector("table")).toBeNull();
        expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    });
});
