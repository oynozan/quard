import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented, type SegmentOption } from "./segmented";

const OPTIONS: SegmentOption[] = [
    { value: "all", label: "All", count: 12 },
    { value: "failed", label: "Failed", count: 0 },
    { value: "archived", label: "Archived", disabled: true },
];

function renderSegmented(onValueChange = vi.fn(), size?: "sm" | "md") {
    render(<Segmented options={OPTIONS} value="all" onValueChange={onValueChange} aria-label="Status" size={size} />);
    return onValueChange;
}

describe("Segmented", () => {
    it("names the group and marks the selected option with its count", () => {
        renderSegmented();
        expect(screen.getByRole("group", { name: "Status" })).toBeTruthy();
        const all = screen.getByRole("button", { name: /^All/ });
        expect(all.getAttribute("aria-pressed")).toBe("true");
        expect(all.textContent).toBe("All12");
        expect(all.className).toContain("h-8");
        expect(screen.getByRole("button", { name: /^Failed/ }).getAttribute("aria-pressed")).toBe("false");
        expect(screen.getByRole("button", { name: "Archived" }).textContent).toBe("Archived");
    });

    it("reports the option picked", () => {
        const onValueChange = renderSegmented();
        fireEvent.click(screen.getByRole("button", { name: /^Failed/ }));
        expect(onValueChange).toHaveBeenCalledWith("failed");
    });

    it("keeps one option selected when the selected one is clicked again", () => {
        const onValueChange = renderSegmented();
        fireEvent.click(screen.getByRole("button", { name: /^All/ }));
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it("ignores a disabled option", () => {
        const onValueChange = renderSegmented();
        fireEvent.click(screen.getByRole("button", { name: "Archived" }));
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it("can match the nav item size", () => {
        renderSegmented(vi.fn(), "md");
        expect(screen.getByRole("button", { name: /^All/ }).className).toContain("min-h-[37px]");
    });
});
