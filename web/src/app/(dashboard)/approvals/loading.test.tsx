import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("ApprovalsLoading", () => {
    it("keeps the page heading and both sections while approvals load", () => {
        const { container } = render(<Loading />);
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Loading approvals…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
        expect(container.textContent).toContain("Waiting for an answer");
        expect(container.textContent).toContain("Always approve");
    });

    it("shows the grants table columns over four skeleton rows", () => {
        const { container } = render(<Loading />);
        const columns = [...container.querySelectorAll("th")].map((th) => th.textContent);
        expect(columns).toEqual(["Grant", "Arguments", "Argument hash", "Approved by", "Used", "Actions"]);
        expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    });
});
