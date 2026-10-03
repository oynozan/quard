import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKey } from "@/lib/data/settings";
import { MINUTE, NOW } from "@/lib/data/rng";
import { agentKeys } from "@/lib/data/settings/fixtures";
import { KeyRow } from "./key-row";

const KEYS = agentKeys();
const ACTIVE = KEYS.find((key) => key.id === "key_2c8e") as AgentKey;
const SINGLE = KEYS.find((key) => key.id === "key_91be") as AgentKey;
const REVOKED = KEYS.find((key) => key.id === "key_0e77") as AgentKey;

function setup(item: AgentKey, fresh = false) {
    const onRevoke = vi.fn();
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

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("KeyRow", () => {
    it("shows an active app key with its agents, owner, dates and a revoke button", () => {
        setup(ACTIVE);
        expect(cells()).toEqual([
            "orchestrator-appqk_live_2c8e…",
            "Apporchestrator, researcher",
            "dana@acme.com",
            "6 Aug",
            "1 min ago",
            "Active",
            "Revoke",
        ]);
        expect(screen.getByText("orchestrator, researcher").getAttribute("title")).toBe("orchestrator, researcher");
        expect(screen.getByText("dana@acme.com").getAttribute("title")).toBe("dana@acme.com");
    });

    it("labels a one-agent key and says when it was never used", () => {
        setup({ ...SINGLE, lastUsedAt: null });
        expect(cells()[1]).toBe("Agentdeploy-bot");
        expect(cells()[4]).toBe("Not used yet");
    });

    it("asks to confirm in place and moves focus to the confirm button", async () => {
        const { onRevoke } = setup(ACTIVE);
        fireEvent.click(opener());
        await act(async () => {});
        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        const confirm = within(group).getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` });
        expect(document.activeElement).toBe(confirm);
        expect(within(group).getByRole("button", { name: "Cancel" })).toBeTruthy();
        expect(onRevoke).not.toHaveBeenCalled();
    });

    it("cancels the confirm and gives focus back to the revoke button", async () => {
        setup(ACTIVE);
        fireEvent.click(opener());
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => {});
        expect(screen.queryByRole("group")).toBeNull();
        expect(document.activeElement).toBe(opener());
    });

    it("cancels the confirm with Escape but ignores other keys", async () => {
        setup(ACTIVE);
        fireEvent.click(opener());
        await act(async () => {});
        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        fireEvent.keyDown(group, { key: "Tab" });
        expect(screen.getByRole("group")).toBeTruthy();
        fireEvent.keyDown(group, { key: "Escape" });
        await act(async () => {});
        expect(screen.queryByRole("group")).toBeNull();
        expect(document.activeElement).toBe(opener());
    });

    it("shows a busy revoke that Escape cannot stop, then revokes the key", async () => {
        const { onRevoke } = setup(ACTIVE);
        fireEvent.click(opener());
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: `Confirm revoking ${ACTIVE.name}` }));
        await act(async () => {});

        const group = screen.getByRole("group", { name: `Revoke key ${ACTIVE.name}` });
        const busy = within(group).getByRole("button");
        expect(busy.textContent).toBe("Revoking…");
        expect(busy.getAttribute("aria-busy")).toBe("true");
        expect(busy.getAttribute("aria-label")).toBeNull();
        fireEvent.keyDown(group, { key: "Escape" });
        expect(screen.getByRole("group")).toBeTruthy();

        await act(() => vi.advanceTimersByTimeAsync(649));
        expect(onRevoke).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(onRevoke).toHaveBeenCalledWith(ACTIVE.id);
    });

    it("shows a revoked key with how long ago, who revoked it and no actions", () => {
        setup(REVOKED);
        expect(cells().slice(5)).toEqual(["Revoked61 d ago", "No actions"]);
        expect(screen.getByTitle("Revoked by dana@acme.com")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("says just now for a key revoked under a minute ago and names an admin when the person is unknown", () => {
        setup({ ...ACTIVE, revokedAt: NOW - 59_000, revokedBy: null });
        expect(cells()[5]).toBe("RevokedJust now");
        expect(screen.getByTitle("Revoked by an admin")).toBeTruthy();
    });

    it("counts a key revoked a minute ago in minutes", () => {
        setup({ ...ACTIVE, revokedAt: NOW - MINUTE, revokedBy: "li.wei@acme.com" });
        expect(cells()[5]).toBe("Revoked1 min ago");
    });

    it("shows a dash in place of the age when the revoke time is the zero timestamp", () => {
        setup({ ...ACTIVE, revokedAt: 0 });
        expect(cells()[5]).toBe("Revoked— ago");
        expect(screen.getByText("—").classList.contains("mono")).toBe(true);
    });

    it("takes focus on the revoked note when the key was just revoked", () => {
        setup({ ...ACTIVE, revokedAt: NOW, revokedBy: "dana@acme.com" }, true);
        expect(document.activeElement).toBe(screen.getByTitle("Revoked by dana@acme.com"));
    });

    it("leaves focus alone on a revoked key that is not fresh", () => {
        setup(REVOKED);
        expect(document.activeElement).toBe(document.body);
    });
});
