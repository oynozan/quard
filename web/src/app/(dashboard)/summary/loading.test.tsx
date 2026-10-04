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

    it("draws every chart pane loading in place", () => {
        render(<SummaryLoading />);

        for (const name of [
            "By entry source",
            "By damaging tool",
            "Blocks per day",
            "Entry points",
            "Turning points",
        ]) {
            expect(section(name).getAttribute("aria-busy"), name).toBe("true");
            expect(within(section(name)).getByRole("img").getAttribute("aria-label")).toBe(`${name}, loading`);
        }
        expect(section("Blocks by hour, all guards").getAttribute("aria-busy")).toBe("true");
        expect(section("Spend per day").getAttribute("aria-busy")).toBe("true");
    });

    it("keeps the run limit tiles and the tables' headers over loading rows", () => {
        render(<SummaryLoading />);

        expect(section("Run limits").getAttribute("aria-busy")).toBe("true");
        expect(within(section("Run limits")).getAllByRole("progressbar")).toHaveLength(5);
        expect(within(section("Untrusted links")).getByRole("status").textContent).toBe("Loading links…");
        expect(within(section("Quarantine")).getAllByRole("columnheader")).toHaveLength(6);
        expect(within(section("Quarantine")).getByRole("status").textContent).toBe("Loading quarantine…");
        expect(within(section("New payees")).getByRole("status").textContent).toBe("Loading new payees…");
    });
});
