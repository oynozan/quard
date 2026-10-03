import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { quarantined } from "@/lib/data/fleet/quarantine";
import { formatLongDate } from "@/lib/format";
import { MarkKnownDrawer } from "./mark-known-drawer";

const value = quarantined()[2];

async function openDrawer(busy = false) {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<MarkKnownDrawer open value={value} busy={busy} onConfirm={onConfirm} onClose={onClose} />);
    await act(async () => {});
    return { onConfirm, onClose, dialog: screen.getByRole("dialog", { name: "Mark as known" }) };
}

function term(dialog: HTMLElement, name: string): string | null | undefined {
    const dt = within(dialog).getByText(name, { selector: "dt" });
    return dt.nextElementSibling?.textContent;
}

describe("MarkKnownDrawer", () => {
    it("shows the value's hash and everything known about it", async () => {
        const { dialog } = await openDrawer();
        expect(within(dialog).getByText(value.hash)).toBeTruthy();
        expect(term(dialog, "Email")).toBe(value.value);
        expect(term(dialog, "Field")).toBe("to");
        expect(term(dialog, "Agents")).toBe("billing, support");
        expect(term(dialog, "First seen")).toBe(formatLongDate(value.firstSeenAt));
        expect(term(dialog, "Quarantined")).toBe(formatLongDate(value.quarantinedAt));
        expect(term(dialog, "Runs that used it")).toBe("5");
        expect(term(dialog, "Blocked attempts")).toBe("2");
        expect(term(dialog, "Last attempt")).toBe(formatLongDate(value.lastAttemptAt));
        expect(within(dialog).getByText(/Unblocks this value fleet-wide/)).toBeTruthy();
    });

    it("confirms with the main button and cancels with the link", async () => {
        const { onConfirm, onClose } = await openDrawer();
        fireEvent.click(screen.getByRole("button", { name: "Mark as known" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes from its own close button while idle", async () => {
        const { onClose } = await openDrawer();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await act(async () => {});
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stays open and locks its buttons while marking", async () => {
        const { onClose } = await openDrawer(true);
        const confirm = screen.getByRole("button", { name: "Marking as known…" });
        expect(confirm.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await act(async () => {});
        expect(onClose).not.toHaveBeenCalled();
    });

    it("shows only its title when no value was picked yet", async () => {
        render(<MarkKnownDrawer open value={null} busy={false} onConfirm={() => {}} onClose={() => {}} />);
        await act(async () => {});
        const dialog = screen.getByRole("dialog", { name: "Mark as known" });
        expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
        expect(within(dialog).queryByText("Field")).toBeNull();
    });
});
