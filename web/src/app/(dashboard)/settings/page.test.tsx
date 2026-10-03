import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { IN_USE, NEW_INSTALL } from "../../../../test/settings/data";
import { agentKey } from "../../../../test/settings/keys";
import SettingsPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
    createKey: vi.fn(),
    revokeKey: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/data/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/data/scope", async () => {
    const { NOW } = await import("../../../../test/time");
    return { requestTime: async () => NOW };
});
vi.mock("./actions", () => ({ createKey: mocks.createKey, revokeKey: mocks.revokeKey }));

async function showPage(searchParams: Record<string, string | string[]> = {}) {
    render(await SettingsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

beforeEach(() => {
    mocks.getSettings.mockResolvedValue(IN_USE);
});

describe("SettingsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Settings");
    });

    it("counts only the active keys, on their own tab", async () => {
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys3");
        expect(tab(/^Accounts/).textContent).toBe("Accounts");
        expect(tab(/^Retention/).textContent).toBe("Retention");
        expect(tab(/^Rules from code/).textContent).toBe("Rules from code");
    });

    it("shows no key count when no key is active", async () => {
        mocks.getSettings.mockResolvedValue({ ...IN_USE, keys: [agentKey("old", { revokedAt: 0 })] });
        await showPage();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys");
    });

    it("ages keys against the request time and revokes them through the server action", async () => {
        await showPage();
        const used = screen.getByText("billing-service").closest("tr") as HTMLElement;
        expect(used.textContent).toContain("1 min ago");
        fireEvent.click(screen.getByRole("button", { name: "Revoke key deploy-bot" }));
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoking deploy-bot" }));
        await act(async () => {});
        expect(mocks.revokeKey).toHaveBeenCalledWith("key-deploy-bot");
    });

    it("opens on agent keys unless the address names another tab", async () => {
        await showPage();
        expect(tab(/^Agent keys/).getAttribute("aria-selected")).toBe("true");
    });

    it("opens the tab named in the address", async () => {
        await showPage({ tab: "retention" });
        expect(tab(/^Retention/).getAttribute("aria-selected")).toBe("true");
        expect(tab(/^Agent keys/).getAttribute("aria-selected")).toBe("false");
        expect(screen.getByText("30")).toBeTruthy();
    });

    it.each([
        ["keys", "No agent keys yet"],
        ["accounts", "Anyone who signs in with email or GitHub can use Quard"],
        ["retention", "No project yet"],
        ["code", "Nothing reported yet"],
    ])("shows the %s tab of a new install as one line, with no tables or charts", async (name, line) => {
        mocks.getSettings.mockResolvedValue(NEW_INSTALL);
        await showPage({ tab: name });
        expect(screen.getByText(line)).toBeTruthy();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys");
        expectNoChartsOrTables();
    });
});
