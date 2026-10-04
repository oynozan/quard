import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayStatus } from "@/lib/data/types";
import { ReplayButton } from "./replay-button";

const action = vi.hoisted(() => ({ replayIncident: vi.fn() }));
vi.mock("@/lib/data/incidents/actions", () => action);
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toast);
// The shader button is drawn and tested on its own; here only its label, state and click matter
vi.mock("@/components/liquid-metal/liquid-metal-button", () => ({
    LiquidMetalButton: (props: { label: string; onClick: () => void; disabled: boolean; title: string }) => (
        <button type="button" onClick={props.onClick} disabled={props.disabled} title={props.title}>
            {props.label}
        </button>
    ),
}));

const ID = "inc_0123456789abcdef";

function show(status: ReplayStatus, found = true, findFailed?: boolean) {
    render(<ReplayButton id={ID} status={status} found={found} findFailed={findFailed} />);
}

function button(name: string) {
    return screen.getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
    action.replayIncident.mockResolvedValue("started");
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("ReplayButton", () => {
    it("offers a replay and says what it reruns", () => {
        show("not started");
        expect(button("Replay").disabled).toBe(false);
        expect(button("Replay").title).toBe(
            "Rerun the turning-point call 5 times with and 5 without the content, round by round",
        );
    });

    it("starts the replay, busy until the server answers, then says so", async () => {
        let answer: (value: string) => void = () => {};
        action.replayIncident.mockReturnValue(new Promise((resolve) => (answer = resolve)));
        show("failed");
        fireEvent.click(button("Replay"));
        expect(action.replayIncident).toHaveBeenCalledWith(ID, { raiseCap: false });
        expect(button("Replaying…").getAttribute("aria-busy")).toBe("true");
        await act(async () => answer("started"));
        expect(toast.showToast).toHaveBeenCalledWith(
            "Replay started. Rounds show here as they finish",
            "incident-replay",
        );
    });

    it("says when someone else already started it", async () => {
        action.replayIncident.mockResolvedValue("running");
        show("not started");
        await act(async () => fireEvent.click(button("Replay")));
        expect(toast.showToast).toHaveBeenCalledWith("The replay is already running", "incident-replay");
    });

    it("says when the replay could not be started", async () => {
        action.replayIncident.mockRejectedValue(new Error("offline"));
        show("not started");
        await act(async () => fireEvent.click(button("Replay")));
        expect(toast.showToast).toHaveBeenCalledWith("Could not start the replay", "incident-replay");
    });

    it("continues with $5 more once the cap is reached", async () => {
        show("cap reached");
        await act(async () => fireEvent.click(button("Continue with $5 more")));
        expect(action.replayIncident).toHaveBeenCalledWith(ID, { raiseCap: true });
    });

    it("is a busy button while the worker replays", () => {
        show("running");
        expect(button("Replaying…").disabled).toBe(true);
        expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    });

    it.each([
        ["confirmed", true, "The replay already has an answer"],
        ["not confirmed", true, "The replay already has an answer"],
        ["could not reproduce", true, "The replay already has an answer"],
        ["limited", true, "Replay can't run for this incident"],
        ["not started", false, "Replay starts once the verdict is found"],
    ] as const)("is disabled when %s, with the reason", (status, found, reason) => {
        show(status, found);
        expect(button("Replay").disabled).toBe(true);
        expect(button("Replay").title).toBe(reason);
    });

    it("says it can't run when the root-cause finder failed", () => {
        show("not started", false, true);
        expect(button("Replay").disabled).toBe(true);
        expect(button("Replay").title).toBe("Replay can't run: the root cause was not found");
    });
});
