import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubClipboard, unstubClipboard } from "../../../../test/ui-kit-metal/clipboard";
import { CopyButton } from "./copy-button";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    unstubClipboard();
});

async function click() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button"));
    });
}

// The button keeps a hidden "Copied" for its width; the visible word is the last span
function shown() {
    return screen.getByRole("button").querySelector(".grid")?.lastElementChild;
}

function announced(container: HTMLElement) {
    return container.querySelector("[aria-live]")?.textContent;
}

describe("CopyButton", () => {
    it("copies the value, says Copied in mint, then returns to its label", async () => {
        const writeText = stubClipboard();
        const { container } = render(<CopyButton value="run_42" label="Copy ID" className="extra" />);
        expect(shown()?.textContent).toBe("Copy ID");
        expect(announced(container)).toBe("");
        expect(screen.getByRole("button").className).toContain("extra");
        await click();
        expect(writeText).toHaveBeenCalledWith("run_42");
        expect(shown()?.textContent).toBe("Copied");
        expect(shown()?.className).toContain("text-mint");
        expect(announced(container)).toBe("Copied");
        act(() => vi.advanceTimersByTime(1600));
        expect(shown()?.textContent).toBe("Copy ID");
        expect(announced(container)).toBe("");
    });

    it("says the copy is unavailable when the clipboard refuses", async () => {
        stubClipboard(true);
        const { container } = render(<CopyButton value="run_42" />);
        await click();
        expect(shown()?.textContent).toBe("Copy unavailable");
        expect(shown()?.className).not.toContain("text-mint");
        expect(announced(container)).toBe("Copy unavailable");
    });

    it("restarts the timer when copied again before it ends", async () => {
        stubClipboard();
        render(<CopyButton value="run_42" />);
        await click();
        act(() => vi.advanceTimersByTime(1000));
        await click();
        act(() => vi.advanceTimersByTime(1000));
        expect(shown()?.textContent).toBe("Copied");
        act(() => vi.advanceTimersByTime(600));
        expect(shown()?.textContent).toBe("Copy");
    });
});
