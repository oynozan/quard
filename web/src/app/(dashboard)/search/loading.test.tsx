import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SearchLoading from "./loading";

describe("SearchLoading", () => {
    it("keeps the heading, the field and the results header while the page loads", () => {
        render(<SearchLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Search" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("Searching runs…");
        expect(screen.getAllByRole("columnheader")).toHaveLength(6);
        expect(screen.getAllByRole("rowgroup")[1].getAttribute("aria-busy")).toBe("true");
    });
});
