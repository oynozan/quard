import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Replay } from "@/lib/data/incidents/types";
import { replayOf } from "../../../../test/incidents-search/replay";
import { ReplayButton } from "./replay-button";
import { ReplayProvider } from "./replay-context";

vi.mock("@paper-design/shaders", () => import("../../../../test/incidents-search/shaders"));

function show(replay: Replay) {
    render(
        <ReplayProvider initial={replay}>
            <ReplayButton />
        </ReplayProvider>,
    );
}

describe("ReplayButton", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("offers a round and says what it reruns", () => {
        show(replayOf([[4, 0]]));
        const button = screen.getByRole("button", { name: "Replay round" }) as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        expect(button.title).toBe("Rerun the turning-point call 5 times with and 5 without the content");
    });

    it("is disabled with the reason when no round may run", () => {
        show(replayOf([[4, 0]], [], { limited: true }));
        const button = screen.getByRole("button", { name: "Replay round" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.title).toBe("URL-only evidence can't be rebuilt");
    });

    it("turns into a busy Replaying button once clicked", () => {
        show(replayOf([[4, 0]]));
        fireEvent.click(screen.getByRole("button", { name: "Replay round" }));
        const busy = screen.getByRole("button", { name: "Replaying…" }) as HTMLButtonElement;
        expect(busy.disabled).toBe(true);
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(screen.queryByRole("button", { name: "Replay round" })).toBeNull();
    });
});
