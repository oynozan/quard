import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Replay } from "@/lib/data/incidents/types";
import { replayOf } from "../../../../test/incidents-search/replay";
import { ReplayResults } from "./replay-results";

function show(replay: Replay, workerRunning = true) {
    return render(<ReplayResults replay={replay} workerRunning={workerRunning} />);
}

const WAITING = "Waiting for the worker. It isn't running.";

// The With, Without and p readouts above the rounds, as one line of text
function readouts() {
    return screen.getByText(/^vs /).parentElement?.parentElement?.textContent;
}

function chart() {
    return screen.getByRole("img");
}

describe("ReplayResults", () => {
    it("keeps the pane with dashes and an empty field before the first round", () => {
        show(replayOf([]));
        expect(screen.getByRole("region", { name: "Replay results" })).toBeTruthy();
        expect(screen.getByText("0 × 5 + 5")).toBeTruthy();
        expect(readouts()).toBe("With—harmfulWithout—harmfulp—vs 0.0182");
        expect(screen.getByText("Not started")).toBeTruthy();
        expect(chart().getAttribute("aria-label")).toBe("No replay rounds yet.");
        expect(chart().textContent).toBe("RoundWithWithoutp after roundNo rounds yet");
        const meter = screen.getByRole("progressbar");
        expect(meter.previousElementSibling?.textContent).toBe("Cost $0.0000 / $5.00 cap");
        expect(screen.getByRole("button", { name: "Setup" })).toBeTruthy();
    });

    it("keeps the table header over an empty table view", () => {
        show(replayOf([]));
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Replay rounds" });
        expect(
            within(table)
                .getAllByRole("row")
                .map((row) => row.textContent),
        ).toEqual(["RoundWithWithoutpCost"]);
        expect(screen.getByText("No rounds yet")).toBeTruthy();
        expect(table.parentElement?.style.height).toBe("150px");
    });

    it("shows the first round running, with dashes until it finishes", () => {
        show(replayOf([], [], { status: "running" }));
        expect(screen.getByText("Replaying round 1…")).toBeTruthy();
        expect(screen.getByText("0 × 5 + 5")).toBeTruthy();
        expect(readouts()).toBe("With—harmfulWithout—harmfulp—vs 0.0182");
        expect(chart().getAttribute("aria-label")).toBe("No replay rounds yet.");
        const pending = within(chart()).getByText("Round 1").parentElement as HTMLElement;
        expect(pending.textContent).toBe("Round 1Running…");
        expect(within(chart()).queryByText("No rounds yet")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Replay rounds" });
        expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
        expect(screen.getByText("No rounds yet")).toBeTruthy();
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
        expect(within(chart()).queryByText("No rounds yet")).toBeNull();
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
        expect(screen.queryByText(/^Replaying/)).toBeNull();
    });

    it("shows a pending row while a round is in progress", () => {
        show(replayOf([[4, 0, 0.0238]], [], { status: "running" }));
        expect(screen.getByText("Replaying round 2…")).toBeTruthy();
        const pending = within(chart()).getByText("Round 2").parentElement as HTMLElement;
        expect(pending.textContent).toBe("Round 2Running…");
        expect(pending.querySelectorAll("svg.animate-pulse")).toHaveLength(2);
    });

    it("says queued, with no spinner or pending row, until the worker claims the replay", () => {
        show(replayOf([], [], { status: "queued" }));
        const line = screen.getByText("Queued");
        expect(line.querySelector(".spinner")).toBeNull();
        expect(line.querySelector(".border-line-strong")).toBeTruthy();
        expect(within(chart()).queryByText("Round 1")).toBeNull();
        expect(within(chart()).getByText("No rounds yet")).toBeTruthy();
    });

    it("says the worker isn't running instead of queued", () => {
        show(replayOf([], [], { status: "queued" }), false);
        expect(screen.getByText(WAITING).querySelector(".bg-warning")).toBeTruthy();
        expect(screen.queryByText("Queued")).toBeNull();
    });

    it("says the worker isn't running instead of replaying, with no pending row", () => {
        show(replayOf([[4, 0, 0.0238]], [], { status: "running" }), false);
        const line = screen.getByText(WAITING);
        expect(line.querySelector(".spinner")).toBeNull();
        expect(line.querySelector(".bg-warning")).toBeTruthy();
        expect(screen.queryByText(/^Replaying/)).toBeNull();
        expect(within(chart()).getByText("Round 1")).toBeTruthy();
        expect(within(chart()).queryByText("Round 2")).toBeNull();
    });

    it("names a finished replay by its own word while no worker is running", () => {
        show(replayOf([[5, 0, 0.004]], [], { status: "confirmed" }), false);
        expect(screen.getByText("Confirmed")).toBeTruthy();
        expect(screen.queryByText(WAITING)).toBeNull();
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

    it("explains a limited replay without a cap warning", () => {
        const reason = "Replay limited: the turning-point request was not recorded";
        show(replayOf([], [], { status: "limited", reason }));
        expect(screen.getByText("Limited")).toBeTruthy();
        expect(screen.getByText(reason)).toBeTruthy();
        expect(screen.queryByText("Cost cap reached")).toBeNull();
    });

    it("says why a replay failed", () => {
        show(replayOf([], [], { status: "failed", reason: "Set OPENAI_API_KEY on the worker to run replay" }));
        expect(screen.getByText("Failed")).toBeTruthy();
        expect(screen.getByText("Set OPENAI_API_KEY on the worker to run replay")).toBeTruthy();
    });

    it("offers $5 more once the cap is reached", () => {
        show(replayOf([[4, 0, 0.0238]], [], { status: "cap reached", capUsd: 0.1 }));
        expect(screen.getByText("Cap reached")).toBeTruthy();
        expect(screen.getByText("Cost cap reached")).toBeTruthy();
        expect(
            screen.getByText("The next round would pass the $0.10 cap. Continue with $5 more to play it."),
        ).toBeTruthy();
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
