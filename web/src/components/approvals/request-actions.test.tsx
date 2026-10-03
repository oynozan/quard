import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestActions } from "./request-actions";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function renderActions(live = true) {
    const onAnswer = vi.fn();
    const view = render(<RequestActions agent="billing" tool="pay_invoice" live={live} onAnswer={onAnswer} />);
    return { onAnswer, ...view };
}

const button = (name: string) => screen.getByRole("button", { name });

const STOPPED_HINT = "The process stopped. The next identical call uses this approval.";

// The hint opens after its hover delay
async function hover(target: HTMLElement) {
    fireEvent.mouseEnter(target);
    fireEvent.mouseMove(target);
    await act(async () => vi.advanceTimersByTime(400));
}

describe("RequestActions", () => {
    it("approves once after a short busy state that locks the other answers", () => {
        const { onAnswer } = renderActions();
        fireEvent.click(button("Approve once"));
        const busy = button("Approving…");
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(button("Always approve").hasAttribute("disabled")).toBe(true);
        expect(button("Deny").hasAttribute("disabled")).toBe(true);
        act(() => vi.advanceTimersByTime(449));
        expect(onAnswer).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(onAnswer).toHaveBeenCalledWith("approve once");
    });

    it("saves an always-approve grant", () => {
        const { onAnswer } = renderActions();
        fireEvent.click(button("Always approve"));
        expect(button("Saving grant…").getAttribute("aria-busy")).toBe("true");
        expect(button("Approve once").hasAttribute("disabled")).toBe(true);
        act(() => vi.advanceTimersByTime(450));
        expect(onAnswer).toHaveBeenCalledWith("always approve");
    });

    it("asks to confirm a deny and moves focus to the confirm button", () => {
        const { onAnswer, container } = renderActions();
        fireEvent.click(button("Deny"));
        expect(container.textContent).toContain("Deny pay_invoice? billing gets a refusal. This cannot be undone.");
        expect(document.activeElement).toBe(button("Deny call"));
        expect(screen.queryByRole("button", { name: "Approve once" })).toBeNull();
        expect(onAnswer).not.toHaveBeenCalled();
    });

    it("denies after the confirm, with cancel locked while it runs", () => {
        const { onAnswer } = renderActions();
        fireEvent.click(button("Deny"));
        fireEvent.click(button("Deny call"));
        expect(button("Denying…").getAttribute("aria-busy")).toBe("true");
        expect(button("Cancel").hasAttribute("disabled")).toBe(true);
        act(() => vi.advanceTimersByTime(450));
        expect(onAnswer).toHaveBeenCalledWith("deny");
    });

    it("cancels the deny and puts focus back on Deny", () => {
        const { onAnswer } = renderActions();
        expect(document.activeElement).toBe(document.body);
        fireEvent.click(button("Deny"));
        fireEvent.click(button("Cancel"));
        expect(document.activeElement).toBe(button("Deny"));
        expect(button("Approve once")).toBeTruthy();
        expect(onAnswer).not.toHaveBeenCalled();
    });

    it("explains approving a stopped call when Approve once is hovered", async () => {
        renderActions(false);
        await hover(button("Approve once"));
        expect(screen.getByText(STOPPED_HINT)).toBeTruthy();
    });

    it("has no stopped-call hint while the process is alive", async () => {
        renderActions(true);
        await hover(button("Approve once"));
        expect(screen.queryByText(STOPPED_HINT)).toBeNull();
    });

    it("explains what always approve covers when it gets focus", async () => {
        renderActions();
        act(() => button("Always approve").focus());
        await act(async () => vi.advanceTimersByTime(400));
        expect(screen.getByText("Same agent, tool and exact arguments, in any run, until revoked.")).toBeTruthy();
    });

    it("drops a pending answer when the card goes away", () => {
        const { onAnswer, unmount } = renderActions();
        fireEvent.click(button("Approve once"));
        unmount();
        act(() => vi.advanceTimersByTime(450));
        expect(onAnswer).not.toHaveBeenCalled();
    });

    it("has no timer to clear when the card goes away unanswered", () => {
        const { onAnswer, unmount } = renderActions();
        const clear = vi.spyOn(window, "clearTimeout");
        unmount();
        expect(clear).not.toHaveBeenCalled();
        expect(onAnswer).not.toHaveBeenCalled();
    });
});
