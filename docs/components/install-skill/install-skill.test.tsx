import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND, COPIED_MS, InstallSkill, SKILL } from "./install-skill";

const writeText = vi.fn();

beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

const button = () => screen.getByRole("button", { name: "Copy the command that installs the Quard skill" });

// Clicks, then lets the clipboard promise settle
const click = () => act(async () => fireEvent.click(button()));

describe("InstallSkill", () => {
    it("names the skill in the command", () => {
        expect(SKILL).toBe("quard");
        expect(COMMAND).toBe("npx skills add oynozan/quard --skill quard");
    });

    it("shows the command with a prompt, kept out of search", () => {
        render(<InstallSkill />);
        expect(button().querySelector("code")?.textContent).toBe(COMMAND);
        expect(button().querySelector(".quard-skill-cmd-prompt")?.getAttribute("aria-hidden")).toBe("true");
        expect(button().getAttribute("data-pagefind-ignore")).toBe("all");
        expect(button().textContent).toContain("Copy");
        expect(button().hasAttribute("data-copied")).toBe(false);
    });

    it("copies the command and says so for a moment", async () => {
        render(<InstallSkill />);
        await click();
        expect(writeText).toHaveBeenCalledWith(COMMAND);
        expect(button().textContent).toContain("Copied");
        expect(button().hasAttribute("data-copied")).toBe(true);
        act(() => vi.advanceTimersByTime(COPIED_MS));
        expect(button().textContent).not.toContain("Copied");
        expect(button().hasAttribute("data-copied")).toBe(false);
    });

    it("starts the moment over on another click", async () => {
        render(<InstallSkill />);
        await click();
        act(() => vi.advanceTimersByTime(COPIED_MS - 200));
        await click();
        act(() => vi.advanceTimersByTime(COPIED_MS - 200));
        expect(button().textContent).toContain("Copied");
        act(() => vi.advanceTimersByTime(200));
        expect(button().textContent).not.toContain("Copied");
    });

    it("stays quiet when the clipboard is refused", async () => {
        writeText.mockRejectedValue(new Error("denied"));
        render(<InstallSkill />);
        await click();
        expect(button().textContent).not.toContain("Copied");
        expect(button().hasAttribute("data-copied")).toBe(false);
    });
});
