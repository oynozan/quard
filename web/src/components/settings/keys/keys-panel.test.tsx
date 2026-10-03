import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/lib/data/rng";
import { agentKeys } from "@/lib/data/settings/fixtures";
import { KeysPanel } from "./keys-panel";

const AGENTS = ["billing", "support"];

function setup(keys = agentKeys()) {
    render(<KeysPanel keys={keys} agents={AGENTS} account="li.wei@acme.com" now={NOW} />);
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

async function openDrawer() {
    fireEvent.click(screen.getAllByRole("button", { name: "Create key" })[0]);
    await act(async () => {});
}

async function submitKey(name: string) {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.click(screen.getByRole("checkbox", { name: "billing" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await act(async () => {});
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("KeysPanel", () => {
    it("says what keys are for and counts active and revoked keys", () => {
        setup();
        expect(screen.getByText("Keys the SDK uses to send events.")).toBeTruthy();
        expect(screen.getByRole("table", { name: "Agent keys: 5 active, 1 revoked" })).toBeTruthy();
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Key", "Scope and agents", "Owner", "Created", "Last used", "Status", "Actions"]);
    });

    it("lists active keys newest first, then revoked keys", () => {
        setup();
        expect(names()).toEqual([
            "deploy-bot",
            "staging",
            "support-app",
            "orchestrator-app",
            "billing-service",
            "billing-service (old)",
        ]);
    });

    it("moves a revoked key below active ones even when it comes first", () => {
        setup(agentKeys().reverse());
        expect(names()[0]).toBe("deploy-bot");
        expect(names().at(-1)).toBe("billing-service (old)");
    });

    it("revokes a key, moves it below the active keys and reads out the change", async () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Revoke key staging" }));
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoking staging" }));
        await act(() => vi.advanceTimersByTimeAsync(650));

        expect(names()).toEqual([
            "deploy-bot",
            "support-app",
            "orchestrator-app",
            "billing-service",
            "staging",
            "billing-service (old)",
        ]);
        expect(liveNote()).toBe("Key staging revoked. Agents using it are refused from now on.");
        expect(screen.getByRole("table", { name: "Agent keys: 4 active, 2 revoked" })).toBeTruthy();
        expect(document.activeElement).toBe(screen.getByTitle("Revoked by li.wei@acme.com"));
        expect(document.activeElement?.textContent).toBe("RevokedJust now");
    });

    it("adds a created key at the top and reads out its name", async () => {
        setup();
        await openDrawer();
        await submitKey("reports");
        await act(() => vi.advanceTimersByTimeAsync(700));
        fireEvent.click(screen.getByRole("button", { name: "I saved the key" }));
        await act(() => vi.advanceTimersByTimeAsync(240));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(names()[0]).toBe("reports");
        expect(liveNote()).toBe("Key reports created.");
        expect(screen.getByRole("table", { name: "Agent keys: 6 active, 1 revoked" })).toBeTruthy();
    });

    it("refuses a name an active key uses but allows one only a revoked key used", async () => {
        setup();
        await openDrawer();
        await submitKey("staging");
        expect(screen.getByText("An active key already has this name.")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: "billing-service (old)" } });
        fireEvent.blur(screen.getByLabelText("Name"));
        expect(screen.queryByText("An active key already has this name.")).toBeNull();
    });

    it("shows an empty state whose button opens the create drawer", async () => {
        setup([]);
        expect(screen.getByRole("heading", { level: 3, name: "No agent keys yet" })).toBeTruthy();
        expect(screen.getByText("One key per app that runs agents.")).toBeTruthy();
        expect(screen.getByRole("table", { name: "Agent keys: 0 active, 0 revoked" })).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: "Create key" })[1]);
        await act(async () => {});
        expect(screen.getByRole("dialog", { name: "Create key" })).toBeTruthy();
    });
});
