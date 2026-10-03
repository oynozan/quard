import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/auth-app/browser";
import SummaryLoading from "./loading";

describe("SummaryLoading", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps the heading and the period label while the dates and quarantine load", () => {
        render(<SummaryLoading />);
        expect(screen.getByRole("heading", { level: 1, name: "Summary" })).toBeTruthy();
        // The period has no dates yet, only a skeleton bar
        expect(screen.getByText("Last 30 days").textContent).toBe("Last 30 days");
        expect(screen.getByRole("region", { name: "Quarantine" }).getAttribute("aria-busy")).toBe("true");
    });
});
