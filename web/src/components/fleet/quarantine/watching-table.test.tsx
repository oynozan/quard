import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { WATCHING } from "../../../../test/summary/fleet";
import { NOW } from "../../../../test/time";
import { WatchingTable } from "./watching-table";

const byRuns = (runs: number) => WATCHING.filter((row) => row.runs === runs);

function shownValues(): string[] {
    return screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0].querySelector("strong")?.textContent ?? "");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("WatchingTable", () => {
    it("leads with values seen in more than one run, most runs first", () => {
        render(<WatchingTable rows={WATCHING} runsToBlock={5} now={NOW} />);
        const top = screen.getAllByRole("row")[1];

        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
        expect(shownValues()).toEqual([byRuns(3)[0].value, byRuns(2)[0].value]);
        expect(within(top).getByRole("progressbar").getAttribute("aria-label")).toBe(
            `3 of 5 runs before ${byRuns(3)[0].value} is blocked`,
        );
        expect(top.textContent).toContain("3 / 5");
        expect(top.textContent).toContain("2 d ago");
    });

    it("folds the single-run values into a count that expands and collapses", () => {
        render(<WatchingTable rows={WATCHING} runsToBlock={5} now={NOW} />);
        const toggle = screen.getByRole("button", { name: "3 more at 1 run" });

        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(toggle.textContent).toBe("Show fewer");
        // Single-run values follow, newest first
        const single = [...byRuns(1)].sort((a, b) => b.firstSeenAt - a.firstSeenAt).map((row) => row.value);
        expect(shownValues()).toEqual([byRuns(3)[0].value, byRuns(2)[0].value, ...single]);
        fireEvent.click(toggle);
        expect(shownValues()).toHaveLength(2);
    });

    it("shows no toggle when every value has more than one run", () => {
        render(<WatchingTable rows={byRuns(3)} runsToBlock={5} now={NOW} />);

        expect(shownValues()).toHaveLength(1);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("lists single-run values in full when none has more runs", () => {
        render(<WatchingTable rows={byRuns(1)} runsToBlock={5} now={NOW} />);

        expect(shownValues()).toHaveLength(3);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("draws nothing when no value is being counted", () => {
        const { container } = render(<WatchingTable rows={[]} runsToBlock={5} now={NOW} />);

        expect(container.childElementCount).toBe(0);
    });
});
