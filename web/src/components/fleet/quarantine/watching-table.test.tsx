import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watched } from "@/lib/data/fleet/quarantine";
import { NOW } from "@/lib/data/rng";
import { stubBrowser } from "../../../../test/fleet-shell/env";
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
