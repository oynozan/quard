import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewChunk, taxNotice } from "../../../test/labels/chunks";
import { labelOptions, ReviewDrawer, suggestedLabel } from "./review-drawer";

function show(chunk = reviewChunk(), busy = false) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = render(<ReviewDrawer open chunk={chunk} busy={busy} onSave={onSave} onClose={onClose} />);
    return { onSave, onClose, view };
}

describe("suggestedLabel and labelOptions", () => {
    it("suggest the fallback's label when it gave one, and offer it beside the fixed labels", () => {
        expect(suggestedLabel(reviewChunk())).toBe("payment_fraud");
        expect(suggestedLabel(taxNotice())).toBe("tax_notice");
        expect(labelOptions(reviewChunk())).toHaveLength(13);
        expect(labelOptions(taxNotice()).at(-1)).toEqual({ value: "tax_notice", label: "tax_notice" });
    });
});

describe("ReviewDrawer", () => {
    it("shows the chunk in full, its likeliest labels and where it came from", () => {
        show(taxNotice());
        const dialog = screen.getByRole("dialog");
        expect(dialog.textContent).toContain("Your 2026 tax return is due.");
        expect(dialog.textContent).toContain("none61%");
        expect(dialog.textContent).toContain("A letter about a tax return.");
        expect(within(dialog).getByRole("link", { name: "111111111111" }).getAttribute("href")).toBe(
            `/runs/${"1".repeat(32)}`,
        );
    });

    it("approves the suggested label", () => {
        const { onSave } = show(taxNotice());
        fireEvent.click(screen.getByRole("button", { name: "Approve tax_notice" }));
        expect(onSave).toHaveBeenCalledWith("tax_notice");
    });

    it("saves a corrected label", async () => {
        const { onSave } = show();
        fireEvent.click(screen.getByRole("combobox", { name: "Right label" }));
        await act(async () => {});
        // A real mouse click on an item starts with a pointer down on it
        const option = screen.getByRole("option", { name: "invoice" });
        fireEvent.pointerDown(option, { pointerType: "mouse" });
        fireEvent.click(option);
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Correct to invoice" }));
        expect(onSave).toHaveBeenCalledWith("invoice");
    });

    it("says it is saving and can't be closed while busy", () => {
        const { onClose } = show(reviewChunk(), true);
        expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes from Cancel or Escape", () => {
        const { onClose } = show();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("is empty without a chunk", () => {
        render(<ReviewDrawer open={false} chunk={null} busy={false} onSave={vi.fn()} onClose={vi.fn()} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
