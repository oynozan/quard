import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { Replay } from "@/lib/data/incidents/types";
import { replayOf } from "../../../../test/incidents-search/replay";
import { ReplayButton } from "./replay-button";
import { ReplayProvider, useReplay } from "./replay-context";
import { ReplayResults } from "./replay-results";

vi.mock("@paper-design/shaders", () => import("../../../../test/incidents-search/shaders"));

const ROUND_MS = 3200;

// A plain caller of the context, to start rounds the page button would not allow
function Starter() {
    const { start, allowed, replay } = useReplay();
    return (
        <button type="button" onClick={start} title={allowed.reason ?? ""}>
            Start {replay.rounds.length}
        </button>
    );
}

function page(replay: Replay) {
    return render(
        <ReplayProvider initial={replay}>
            <ReplayButton />
            <ReplayResults />
            <Toaster />
        </ReplayProvider>,
    );
}

function finishRound() {
    act(() => vi.advanceTimersByTime(ROUND_MS));
}

// Sonner shows a new toast on the next tick
function flushToasts() {
    act(() => vi.advanceTimersByTime(1));
}

describe("ReplayProvider", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("runs a demo round, adds it to the results and reports it", () => {
        page(replayOf([[4, 0]]));
        fireEvent.click(screen.getByRole("button", { name: "Replay round" }));
        expect(screen.getByText("Replaying round 2…")).toBeTruthy();
        expect(screen.getByText("Running…")).toBeTruthy();

        finishRound();
        flushToasts();
        expect(screen.getByText("Round 2 finished. Confirmed")).toBeTruthy();
        expect(screen.getByText("Confirmed")).toBeTruthy();
        expect(screen.queryByText("Running…")).toBeNull();
        expect(screen.getByRole("img").getAttribute("aria-label")).toContain("2 rounds.");
        expect(screen.getByRole("button", { name: "Replay round" })).toBeTruthy();
    });

    it("reports a round that leaves the result open as not decided", () => {
        page(replayOf([[1, 0]]));
        fireEvent.click(screen.getByRole("button", { name: "Replay round" }));
        finishRound();
        flushToasts();
        expect(screen.getByText("Round 2 finished. Not decided yet")).toBeTruthy();
    });

    it("says a round is running and ignores a second start meanwhile", () => {
        render(
            <ReplayProvider initial={replayOf([[4, 0]])}>
                <Starter />
            </ReplayProvider>,
        );
        const button = screen.getByRole("button", { name: "Start 1" });
        fireEvent.click(button);
        expect(button.title).toBe("A round is running now");
        fireEvent.click(button);
        // The second click schedules no second round
        expect(vi.getTimerCount()).toBe(1);
        finishRound();
        expect(vi.getTimerCount()).toBe(0);
        expect(button.textContent).toBe("Start 2");
        expect(button.title).toBe("");
    });

    it("does not start a round the replay does not allow", () => {
        render(
            <ReplayProvider initial={replayOf([[4, 0]], [], { capReached: true })}>
                <Starter />
            </ReplayProvider>,
        );
        const button = screen.getByRole("button", { name: "Start 1" });
        expect(button.title).toBe("The $5 cost cap is reached");
        fireEvent.click(button);
        expect(vi.getTimerCount()).toBe(0);
        finishRound();
        expect(button.textContent).toBe("Start 1");
    });

    it("drops a running round when the page closes", () => {
        const view = render(
            <ReplayProvider initial={replayOf([[4, 0]])}>
                <Starter />
            </ReplayProvider>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Start 1" }));
        expect(vi.getTimerCount()).toBe(1);
        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("useReplay", () => {
    it("needs a provider above it", () => {
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect(() => render(<Starter />)).toThrow("useReplay needs a ReplayProvider");
        } finally {
            quiet.mockRestore();
        }
    });
});
