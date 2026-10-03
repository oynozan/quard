import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Replay } from "@/lib/data/incidents/types";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { replayOf } from "../../../../test/incidents-search/replay";
import { ReplayResults } from "./replay-results";

function show(replay: Replay) {
    return render(<ReplayResults replay={replay} />);
}

// The With, Without and p readouts above the rounds, as one line of text
function readouts() {
    return screen.getByText(/^vs /).parentElement?.parentElement?.textContent;
}

function chart() {
    return screen.getByRole("img");
}

describe("ReplayResults", () => {
    it("shows one line and nothing drawn before the first round", () => {
        const { container } = show(replayOf([]));
        expect(container.textContent).toBe("No replay rounds yet");
        expect(screen.getByRole("status").textContent).toBe("No replay rounds yet");
        expect(screen.queryByText("Replay results")).toBeNull();
        expectNoChartsOrTables(container);
    });

    it("shows the first round running, with no readouts and no table yet", () => {
        show(replayOf([], [], { inProgress: true }));
        expect(screen.getByText("Replaying round 1…")).toBeTruthy();
        expect(screen.getByText("0 × 5 + 5")).toBeTruthy();
        expect(screen.queryByText(/^vs /)).toBeNull();
        expect(chart().getAttribute("aria-label")).toBe("No replay rounds yet.");
        const pending = within(chart()).getByText("Round 1").parentElement as HTMLElement;
        expect(pending.textContent).toBe("Round 1Running…");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No finished rounds yet")).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("reads the running totals after the last round in the readouts and the chart's label", () => {
        show(
            replayOf([
                [5, 0, 0.004],
                [3, 1, 0.0027],
            ]),
        );
        expect(readouts()).toBe("With8/10harmfulWithout1/10harmfulp0.0027vs 0.0182");
        expect(chart().getAttribute("aria-label")).toBe(
            "2 rounds. Harmful with the content 8 of 10, without 1 of 10. p 0.0027.",
        );
    });

    it("names a confirmed replay", () => {
        show(replayOf([[5, 0, 0.004]], [], { status: "confirmed" }));
        expect(screen.getByText("Confirmed")).toBeTruthy();
    });

    it("marks a round whose p is below the threshold", () => {
        show(replayOf([[5, 0, 0.004]], [], { status: "confirmed" }));
        const row = within(chart()).getByText("Round 1").parentElement as HTMLElement;
        expect(row.textContent).toBe("Round 15/50/50.0040, below the threshold< 0.0182");
    });

    it("marks a round whose p is not below the threshold yet", () => {
        show(replayOf([[4, 0, 0.0238]]));
        const row = within(chart()).getByText("Round 1").parentElement as HTMLElement;
        expect(row.textContent).toBe("Round 14/50/50.0238, not below the threshold≥ 0.0182");
        expect(screen.getByText("Not decided yet")).toBeTruthy();
    });

    it("shows a pending row while a round is in progress", () => {
        show(replayOf([[4, 0, 0.0238]], [], { inProgress: true }));
        expect(screen.getByText("Replaying round 2…")).toBeTruthy();
        const pending = within(chart()).getByText("Round 2").parentElement as HTMLElement;
        expect(pending.textContent).toBe("Round 2Running…");
        expect(pending.querySelectorAll("svg.animate-pulse")).toHaveLength(2);
    });

    it("names the final status when the replay could not reproduce the harm", () => {
        show(
            replayOf(
                [
                    [0, 0, 1],
                    [0, 0, 1],
                ],
                [],
                { status: "could not reproduce" },
            ),
        );
        expect(screen.getByText("Could not reproduce")).toBeTruthy();
    });

    it("shows the cost spent against the cap", () => {
        show(replayOf([[5, 0, 0.004]], [0.05]));
        const meter = screen.getByRole("progressbar");
        expect(meter.previousElementSibling?.textContent).toBe("Cost $0.0500 / $5.00 cap");
        expect(meter.getAttribute("aria-label")).toBe("$0.0500 of the $5.00 cap spent");
        expect(meter.getAttribute("aria-valuenow")).toBe("0.05");
    });

    it("explains a limited replay and a reached cap", () => {
        show(
            replayOf([[4, 0, 0.0238]], [], {
                limited: true,
                limitedReason: "Replay limited: URL-only evidence",
                capReached: true,
            }),
        );
        expect(screen.getByText("Replay limited: URL-only evidence.")).toBeTruthy();
        expect(screen.getByText("Cost cap reached")).toBeTruthy();
        expect(screen.getByText("Raise the cap in Settings to continue.")).toBeTruthy();
    });

    it("shows no notice for a limited replay without a reason, nor a cap warning below it", () => {
        show(replayOf([[4, 0, 0.0238]], [], { limited: true }));
        expect(screen.queryByText(/Replay limited/)).toBeNull();
        expect(screen.queryByText("Cost cap reached")).toBeNull();
    });

    it("keeps the setup behind a toggle", () => {
        show(replayOf([[4, 0, 0.0238]]));
        const toggle = screen.getByRole("button", { name: "Setup" });
        const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
        expect(panel.hidden).toBe(true);
        fireEvent.click(toggle);
        expect(panel.hidden).toBe(false);
        expect(within(panel).getByText("gpt-6.1")).toBeTruthy();
        const call = within(panel).getByText("pay_invoice with iban GB33…5555");
        expect(call.parentElement?.getAttribute("title")).toBe("pay_invoice with iban GB33…5555");
        expect(within(panel).getByText("The supplier page text")).toBeTruthy();
    });

    it("lists each round with its cost in the table view", () => {
        show(
            replayOf(
                [
                    [4, 0, 0.0238],
                    [3, 1, 0.0099],
                ],
                [0.05, 0.25],
            ),
        );
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Replay rounds" });
        const rows = within(table).getAllByRole("row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "RoundWithWithoutpCost",
            "Round 14 / 50 / 50.0238$0.0500",
            "Round 23 / 51 / 50.0099$0.25",
        ]);
        expect(table.parentElement?.style.height).toBe("150px");
    });

    it("grows the table view with many rounds", () => {
        show(
            replayOf([
                [1, 1, 0.7778],
                [1, 1, 0.709],
                [1, 1, 0.6743],
                [1, 1, 0.6526],
                [1, 1, 0.6374],
            ]),
        );
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Replay rounds" });
        expect(table.parentElement?.style.height).toBe("170px");
    });
});
