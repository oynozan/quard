import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

    it("counts the active keys and the reported rules on their tabs", async () => {
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys3");
        expect(tab(/^Accounts/).textContent).toBe("Accounts");
        expect(tab(/^Retention/).textContent).toBe("Retention");
        expect(tab(/^Rules from code/).textContent).toBe("Rules from code3");
    });

    it("counts zero keys when no key is active", async () => {
        mocks.getSettings.mockResolvedValue({ ...IN_USE, keys: [agentKey("old", { revokedAt: 0 })] });
        await showPage();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys0");
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
        ["keys", "Key", "No agent keys yet"],
        ["accounts", "Person", "No accounts to manage"],
        ["retention", "Data", "No project yet"],
    ])("keeps the %s table header on a new install, with its empty state under it", async (name, first, title) => {
        mocks.getSettings.mockResolvedValue(NEW_INSTALL);
        await showPage({ tab: name });
        const table = screen.getByRole("table");
        expect(within(table).getAllByRole("columnheader")[0].textContent).toBe(first);
        expect(within(table).getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
        expect(tab(/^Agent keys/).textContent).toBe("Agent keys0");
    });

    it("keeps every rules-from-code section and table header on a new install", async () => {
        mocks.getSettings.mockResolvedValue(NEW_INSTALL);
        await showPage({ tab: "code" });
        expect(tab(/^Rules from code/).textContent).toBe("Rules from code0");
        const firstHeaders = screen.getAllByRole("table").map((table) => within(table).getAllByRole("columnheader")[0]);
        expect(firstHeaders.map((cell) => cell.textContent)).toEqual(["App", "Rule", "Override"]);
        expect(screen.getByText("No SDK connected yet")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 3, name: "No rules reported yet" })).toBeTruthy();
        expect(screen.getByText("No origin overrides yet")).toBeTruthy();
    });
});
