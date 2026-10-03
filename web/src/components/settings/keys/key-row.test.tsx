import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentKey } from "@/lib/data/settings";
import { agentKey } from "../../../../test/settings/keys";
import { DAY, MINUTE, NOW } from "../../../../test/time";
import { KeyRow } from "./key-row";

const ACTIVE = agentKey("orchestrator-app", {
    prefix: "qk_live_2c8e",
    createdAt: NOW - 58 * DAY,
    lastUsedAt: NOW - 4_000,
});
const REVOKED = agentKey("billing-service (old)", { createdAt: NOW - 96 * DAY, revokedAt: NOW - 61 * DAY });

function setup(item: AgentKey, fresh = false, onRevoke = vi.fn(async () => true)) {
    render(
        <table>
            <tbody>
                <KeyRow item={item} now={NOW} fresh={fresh} onRevoke={onRevoke} />
            </tbody>
        </table>,
    );
    return { onRevoke };
}

function cells(): string[] {
    return screen.getAllByRole("cell").map((cell) => cell.textContent ?? "");
}

function opener(): HTMLElement {
    return screen.getByRole("button", { name: `Revoke key ${ACTIVE.name}` });
}

async function askToConfirm() {
    fireEvent.click(opener());
    await act(async () => {});
}

// A revoke the test settles by hand, to see the busy state in between
function pending() {
    let settle: (revoked: boolean) => void = () => {};
    const onRevoke = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
    return { onRevoke, settle: (revoked: boolean) => act(async () => settle(revoked)) };
}

describe("KeyRow", () => {
    it("shows an active key with its prefix, dates and a revoke button", () => {
        setup(ACTIVE);
        expect(cells()).toEqual(["orchestrator-appqk_live_2c8e…", "6 Aug", "1 min ago", "Active", "Revoke"]);
    });

    it("says when a key was never used", () => {
        setup({ ...ACTIVE, lastUsedAt: null });
        expect(cells()[2]).toBe("Not used yet");
    });

    it("asks to confirm in place and moves focus to the confirm button", async () => {
        const { onRevoke } = setup(ACTIVE);
        await askToConfirm();
        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        const confirm = within(group).getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` });
        expect(document.activeElement).toBe(confirm);
        expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
        expect(onRevoke).not.toHaveBeenCalled();
    });

    it("cancels the confirm and gives focus back to the revoke button", async () => {
        setup(ACTIVE);
        await askToConfirm();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => {});
        expect(screen.queryByRole("group")).toBeNull();
        expect(document.activeElement).toBe(opener());
    });

    it("cancels the confirm with Escape but ignores other keys", async () => {
        setup(ACTIVE);
        await askToConfirm();
        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        fireEvent.keyDown(group, { key: "Tab" });
        expect(screen.getByRole("group")).toBeTruthy();
        fireEvent.keyDown(group, { key: "Escape" });
        await act(async () => {});
        expect(screen.queryByRole("group")).toBeNull();
        expect(document.activeElement).toBe(opener());
    });

    it("stays busy while the server revokes, and Escape cannot stop it", async () => {
        const { onRevoke, settle } = pending();
        setup(ACTIVE, false, onRevoke);
        await askToConfirm();
        fireEvent.click(screen.getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` }));
        await act(async () => {});

        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        const busy = within(group).getByRole("button");
        expect(onRevoke).toHaveBeenCalledOnce();
        expect(busy.textContent).toBe("Revoking…");
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(busy.getAttribute("aria-label")).toBeNull();
        fireEvent.keyDown(group, { key: "Escape" });
        expect(screen.getByRole("group")).toBeTruthy();

        // The reloaded list shows the key as revoked, so the row keeps its confirm until then
        await settle(true);
        expect(within(group).getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` })).toBeTruthy();
    });

    it("goes back to the revoke button when the revoke fails", async () => {
        const { onRevoke, settle } = pending();
        setup(ACTIVE, false, onRevoke);
        await askToConfirm();
        fireEvent.click(screen.getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` }));
        await act(async () => {});
        await settle(false);

        expect(screen.queryByRole("group")).toBeNull();
        expect(document.activeElement).toBe(opener());
    });

    it("shows a revoked key with how long ago, the exact time on hover and no actions", () => {
        setup(REVOKED);
        expect(cells().slice(3)).toEqual(["Revoked61 d ago", "No actions"]);
        expect(screen.getByTitle("3 August 2026 at 18:40").textContent).toBe("Revoked61 d ago");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("says just now for a key revoked under a minute ago, and counts a minute in minutes", () => {
        setup({ ...ACTIVE, revokedAt: NOW - 59_000 });
        expect(cells()[3]).toBe("RevokedJust now");
        setup({ ...ACTIVE, name: "other", revokedAt: NOW - MINUTE });
        expect(cells()[8]).toBe("Revoked1 min ago");
    });

    it("takes focus on the revoked note when the key was just revoked", () => {
        setup({ ...ACTIVE, revokedAt: NOW }, true);
        expect(document.activeElement?.textContent).toBe("RevokedJust now");
    });

    it("leaves focus alone on a revoked key that is not fresh", () => {
        setup(REVOKED);
        expect(document.activeElement).toBe(document.body);
    });
});
