import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKey, CreateKeyResult, RevokeKeyResult } from "@/lib/data/settings";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { agentKey, KEYS } from "../../../../test/settings/keys";
import { NOW } from "../../../../test/time";
import { KeysPanel } from "./keys-panel";

const SECRET = `qk_live_abcd${"0".repeat(44)}`;

function setup(keys: AgentKey[] = KEYS) {
    const props = {
        now: NOW,
        createAction: vi.fn(async (name: string): Promise<CreateKeyResult> => ({
            key: { id: `key-${name}`, name, prefix: "qk_live_abcd" },
            secret: SECRET,
        })),
        revokeAction: vi.fn(async (): Promise<RevokeKeyResult> => ({ ok: true })),
    };
    const view = render(<KeysPanel keys={keys} {...props} />);
    // The page reads the keys again after each change
    const reload = (next: AgentKey[]) => view.rerender(<KeysPanel keys={next} {...props} />);
    return { ...props, reload };
}

function names(): string[] {
    return screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("strong")?.textContent ?? "");
}

function liveNote(): string {
    // Hidden too, since an open drawer hides the page from the accessibility tree
    const statuses = screen.getAllByRole("status", { hidden: true });
    const note = statuses.find((node) => node.getAttribute("aria-live") === "polite");
    if (!note) throw new Error("The panel has no live note");
    return note.textContent;
}

async function revoke(name: string) {
    fireEvent.click(screen.getByRole("button", { name: `Revoke key ${name}` }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: `Confirm revoking ${name}` }));
    await act(async () => {});
}

async function createKey(name: string) {
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create key" }));
    await act(async () => {});
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("KeysPanel", () => {
    it("says what keys are for and lists them with their dates and status", () => {
        setup();
        expect(screen.getByText("Keys the SDK uses to send events.")).toBeTruthy();
        expect(screen.getByRole("table", { name: "Agent keys: 3 active, 1 revoked" })).toBeTruthy();
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Key", "Created", "Last used", "Status", "Actions"]);
    });

    it("lists active keys newest first, then revoked keys, in any order they arrive", () => {
        const { reload } = setup();
        expect(names()).toEqual(["deploy-bot", "orchestrator-app", "billing-service", "billing-service (old)"]);
        reload([...KEYS].reverse());
        expect(names()).toEqual(["deploy-bot", "orchestrator-app", "billing-service", "billing-service (old)"]);
    });

    it("revokes a key on the server, reads out the change and focuses the key once the list reloads", async () => {
        const { revokeAction, reload } = setup();
        await revoke("deploy-bot");

        expect(revokeAction).toHaveBeenCalledWith("key-deploy-bot");
        expect(liveNote()).toBe("Key deploy-bot revoked. Agents using it are refused from now on.");
        reload(KEYS.map((key) => (key.name === "deploy-bot" ? { ...key, revokedAt: NOW } : key)));
        expect(names()).toEqual(["orchestrator-app", "billing-service", "deploy-bot", "billing-service (old)"]);
        expect(screen.getByRole("table", { name: "Agent keys: 2 active, 2 revoked" })).toBeTruthy();
        expect(document.activeElement?.textContent).toBe("RevokedJust now");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows why the server refused a revoke and offers Revoke again", async () => {
        const { revokeAction } = setup();
        revokeAction.mockResolvedValueOnce({ error: "This key is already revoked or no longer exists." });
        await revoke("deploy-bot");

        expect(screen.getByRole("alert").textContent).toBe("This key is already revoked or no longer exists.");
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revoke key deploy-bot" }));
        expect(liveNote()).toBe("");
    });

    it("says the key could not be revoked when the server cannot be reached, and clears that after a revoke works", async () => {
        const { revokeAction } = setup();
        revokeAction.mockRejectedValueOnce(new Error("offline"));
        await revoke("deploy-bot");
        expect(screen.getByRole("alert").textContent).toBe("Could not revoke the key. Try again.");

        await revoke("deploy-bot");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("creates a key through the drawer, reads out its name and lists it once the page reloads", async () => {
        const { createAction, reload } = setup();
        await createKey("reports");

        expect(createAction).toHaveBeenCalledWith("reports");
        expect(screen.getByRole("dialog", { name: "Key created" })).toBeTruthy();
        expect(liveNote()).toBe("Key reports created.");
        fireEvent.click(screen.getByRole("button", { name: "I saved the key" }));
        await act(() => vi.advanceTimersByTimeAsync(240));
        expect(screen.queryByRole("dialog")).toBeNull();

        reload([...KEYS, agentKey("reports", { createdAt: NOW })]);
        expect(names()[0]).toBe("reports");
    });

    it("refuses a name an active key uses but allows one only a revoked key used", async () => {
        const { createAction } = setup();
        await createKey("billing-service");
        expect(screen.getByText("An active key already has this name.")).toBeTruthy();
        expect(createAction).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText("Name"), { target: { value: "billing-service (old)" } });
        fireEvent.blur(screen.getByLabelText("Name"));
        expect(screen.queryByText("An active key already has this name.")).toBeNull();
    });

    it("shows the intro, the create button and one line when there are no keys", async () => {
        setup([]);
        const panel = screen.getByRole("region", { name: "Agent keys" });
        expect(screen.getByText("Keys the SDK uses to send events.")).toBeTruthy();
        expect(screen.getByText("No agent keys yet")).toBeTruthy();
        expectNoChartsOrTables(panel);

        fireEvent.click(screen.getByRole("button", { name: "Create key" }));
        await act(async () => {});
        expect(screen.getByRole("dialog", { name: "Create key" })).toBeTruthy();
    });
});
