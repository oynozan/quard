import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "../../../../test/time";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { watched } from "../../../../test/fleet-shell/quarantine";
import { WatchingTable } from "./watching-table";

const rows = watched();
const byRuns = (runs: number) => rows.filter((row) => row.runs === runs);

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
        render(<WatchingTable rows={rows} runsToBlock={5} now={NOW} />);
        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
        expect(shownValues()).toEqual([byRuns(3)[0].value, byRuns(2)[0].value]);

        const top = screen.getAllByRole("row")[1];
        expect(within(top).getByRole("progressbar").getAttribute("aria-label")).toBe(
            `3 of 5 runs before ${byRuns(3)[0].value} is blocked`,
        );
        expect(top.textContent).toContain("3 / 5");
        expect(top.textContent).toContain("2 d ago");
    });

    it("folds the single-run values into a count that expands and collapses", () => {
        render(<WatchingTable rows={rows} runsToBlock={5} now={NOW} />);
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

    it("says how many runs the folded values have when some have none", () => {
        const none = byRuns(1).map((row) => ({ ...row, runs: 0 }));
        const { unmount } = render(<WatchingTable rows={[...byRuns(3), ...none]} runsToBlock={5} now={NOW} />);
        expect(screen.getByRole("button", { name: "3 more at 0 runs" })).toBeTruthy();
        unmount();

        render(<WatchingTable rows={[...byRuns(3), none[0], ...byRuns(1).slice(1)]} runsToBlock={5} now={NOW} />);
        expect(screen.getByRole("button", { name: "3 more at 0 or 1 run" })).toBeTruthy();
    });

    it("says nothing is being counted when the list is empty", () => {
        render(<WatchingTable rows={[]} runsToBlock={5} now={NOW} />);
        expect(screen.getByRole("status").textContent).toBe("No new values are being counted");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("shows no toggle when every value has more than one run", () => {
        render(<WatchingTable rows={byRuns(3)} runsToBlock={5} now={NOW} />);
        expect(shownValues()).toHaveLength(1);
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
    });
});
