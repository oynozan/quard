import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { CopyRunId } from "./copy-run-id";

// jsdom has no clipboard, so each test installs a fake one.
function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

beforeEach(() => {
    render(<Toaster />);
});

afterEach(() => {
    act(() => {
        toast.dismiss();
    });
    Reflect.deleteProperty(navigator, "clipboard");
});

describe("CopyRunId", () => {
    it("shows the full run id and copies it when clicked", async () => {
        const writeText = vi.fn(async () => {});
        stubClipboard(writeText);
        render(<CopyRunId id="abc123def456" />);

        const button = screen.getByRole("button", { name: "Copy run id" });
        expect(button.textContent).toBe("abc123def456");
        await act(async () => fireEvent.click(button));

        expect(writeText).toHaveBeenCalledWith("abc123def456");
        expect(await screen.findByText("Run id copied")).toBeTruthy();
    });

    it("says the run id could not be copied when the clipboard refuses", async () => {
        stubClipboard(async () => {
            throw new Error("denied");
        });
        render(<CopyRunId id="abc123def456" />);

        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy run id" })));

        expect(await screen.findByText("Could not copy run id")).toBeTruthy();
    });
});
