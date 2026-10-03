import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster } from "./sonner";

afterEach(() => {
    act(() => {
        toast.dismiss();
    });
});

function list() {
    return screen.getByRole("region", { name: /Notifications/ }).querySelector("ol") as HTMLElement;
}

describe("Toaster", () => {
    it("stacks dark toasts in the bottom right corner", async () => {
        render(<Toaster />);
        act(() => {
            toast("Saved");
        });
        expect(await screen.findByText("Saved")).toBeTruthy();
        expect(list().getAttribute("data-sonner-theme")).toBe("dark");
        expect(list().getAttribute("data-y-position")).toBe("bottom");
        expect(list().getAttribute("data-x-position")).toBe("right");
        expect(list().style.getPropertyValue("--normal-bg")).toBe("var(--surface)");
    });

    it("lets a caller move it", async () => {
        render(<Toaster position="top-center" />);
        act(() => {
            toast("Moved");
        });
        await screen.findByText("Moved");
        expect(list().getAttribute("data-y-position")).toBe("top");
        expect(list().getAttribute("data-x-position")).toBe("center");
    });
});
