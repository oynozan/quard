import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubClipboard, unstubClipboard } from "../../../test/ui-kit-metal/clipboard";
import { Toaster } from "./sonner";
import { copyWithToast, showToast } from "./toast";

beforeEach(() => {
    render(<Toaster />);
});

afterEach(() => {
    act(() => {
        toast.dismiss();
    });
    unstubClipboard();
});

function toasts() {
    return document.querySelectorAll("[data-sonner-toast]");
}

describe("showToast", () => {
    it("updates a repeated message in place instead of stacking it", async () => {
        act(() => showToast("Policy saved"));
        act(() => showToast("Policy saved"));
        expect(await screen.findByText("Policy saved")).toBeTruthy();
        expect(toasts()).toHaveLength(1);
    });
});

describe("copyWithToast", () => {
    it("copies the value, says so and returns true", async () => {
        const writeText = stubClipboard();
        let copied: boolean | undefined;
        await act(async () => {
            copied = await copyWithToast("run_42", "Run ID");
        });
        expect(copied).toBe(true);
        expect(writeText).toHaveBeenCalledWith("run_42");
        expect(await screen.findByText("Run ID copied")).toBeTruthy();
    });

    it("says it could not copy and returns false when the clipboard refuses", async () => {
        stubClipboard(true);
        let copied: boolean | undefined;
        await act(async () => {
            copied = await copyWithToast("run_42", "Run ID");
        });
        expect(copied).toBe(false);
        expect(await screen.findByText("Could not copy run id")).toBeTruthy();
    });

    it("replaces the last copy message instead of stacking a new one", async () => {
        stubClipboard();
        await act(async () => {
            await copyWithToast("run_42", "Run ID");
        });
        await screen.findByText("Run ID copied");
        stubClipboard(true);
        await act(async () => {
            await copyWithToast("ag_7", "Agent ID");
        });
        expect(await screen.findByText("Could not copy agent id")).toBeTruthy();
        expect(screen.queryByText("Run ID copied")).toBeNull();
        expect(toasts()).toHaveLength(1);
    });
});
