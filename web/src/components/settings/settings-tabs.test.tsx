import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsTabs } from "./settings-tabs";

const PANELS = {
    keys: <p>Keys panel</p>,
    accounts: <p>Accounts panel</p>,
    retention: <p>Retention panel</p>,
    code: <p>Code panel</p>,
};

function address(): string {
    return window.location.pathname + window.location.search;
}

beforeEach(() => {
    window.history.replaceState(null, "", "/settings?tab=retention&from=nav");
});

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("SettingsTabs", () => {
    it("opens on the initial tab and shows its panel", () => {
        render(<SettingsTabs initial="retention" counts={{}} panels={PANELS} />);
        expect(screen.getByRole("tablist", { name: "Settings sections" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Retention" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByText("Retention panel")).toBeTruthy();
        expect(screen.queryByText("Keys panel")).toBeNull();
    });

    it("shows a count only beside tabs that have one, zero included", () => {
        render(<SettingsTabs initial="keys" counts={{ keys: 6, code: 0 }} panels={PANELS} />);
        const names = screen.getAllByRole("tab").map((tab) => tab.textContent);
        expect(names).toEqual(["Agent keys6", "Accounts and roles", "Retention", "Rules from code0"]);
    });

    it("shows zero for a count that arrives as null from untyped data", () => {
        // Typed callers cannot pass null; plain data can
        const counts = { accounts: null as unknown as number };
        render(<SettingsTabs initial="keys" counts={counts} panels={PANELS} />);
        expect(screen.getByRole("tab", { name: /Accounts and roles/ }).textContent).toBe("Accounts and roles0");
    });

    it("writes the chosen tab into the address and keeps other parameters", async () => {
        render(<SettingsTabs initial="retention" counts={{}} panels={PANELS} />);
        fireEvent.click(screen.getByRole("tab", { name: "Rules from code" }));
        await act(async () => {});
        expect(address()).toBe("/settings?tab=code&from=nav");
        expect(screen.getByText("Code panel")).toBeTruthy();
    });

    it("drops the tab parameter when the first tab is chosen", async () => {
        render(<SettingsTabs initial="retention" counts={{}} panels={PANELS} />);
        fireEvent.click(screen.getByRole("tab", { name: "Agent keys" }));
        await act(async () => {});
        expect(address()).toBe("/settings?from=nav");
        expect(screen.getByText("Keys panel")).toBeTruthy();
    });
});
