import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RunLoading from "./loading";

describe("RunLoading", () => {
    it("tells screen readers the run is loading", () => {
        const { container } = render(<RunLoading />);
        expect(screen.getByRole("status").textContent).toBe("Loading run…");
        expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    });
});
