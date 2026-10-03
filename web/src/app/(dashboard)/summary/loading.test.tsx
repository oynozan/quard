import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import SummaryLoading from "./loading";

function section(name: string) {
    return screen.getByRole("region", { name });
}

describe("SummaryLoading", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps the heading and the period label while the dates load", () => {
        render(<SummaryLoading />);

        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        // The period has no dates yet, only a skeleton bar
        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
    });

    it("shows sections without a source as their title and a small bar", () => {
        render(<SummaryLoading />);

        for (const name of ["Where incidents start", "Run limits", "Quarantine"]) {
            expect(section(name).getAttribute("aria-busy")).toBe("true");
            expect(within(section(name)).getByRole("heading", { level: 2 }).textContent).toBe(name);
            expect(within(section(name)).queryByRole("img")).toBeNull();
            expect(within(section(name)).queryByRole("table")).toBeNull();
            expect(within(section(name)).queryByRole("progressbar")).toBeNull();
        }
    });

    it("keeps the skeletons of the blocks charts and the links table, which have a source", () => {
        render(<SummaryLoading />);

        expect(section("Blocks per day").getAttribute("aria-busy")).toBe("true");
        expect(section("Blocks by hour, all guards").getAttribute("aria-busy")).toBe("true");
        expect(within(section("Untrusted links")).getByRole("status").textContent).toBe("Loading links…");
        expect(screen.queryByRole("region", { name: "Entry points" })).toBeNull();
    });
});
