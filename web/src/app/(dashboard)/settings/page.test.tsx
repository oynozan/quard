import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSettings } from "@/lib/data/settings";
import SettingsPage, { metadata } from "./page";

async function showPage(searchParams: Record<string, string | string[]> = {}) {
    render(await SettingsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("SettingsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Settings");
    });

    it("counts active keys, accounts and rules on their tabs", async () => {
        const data = await getSettings();
        const active = data.keys.filter((key) => key.revokedAt === null).length;
        expect(active).toBeLessThan(data.keys.length);
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
        expect(tab(/^Agent keys/).textContent).toBe(`Agent keys${active}`);
        expect(tab(/^Accounts and roles/).textContent).toBe(`Accounts and roles${data.accounts.length}`);
        expect(tab(/^Rules from code/).textContent).toBe(`Rules from code${data.rules.length}`);
        expect(tab(/^Retention/).textContent).toBe("Retention");
        expect(screen.queryByText("acme-prod")).toBeNull();
    });

    it("opens on agent keys unless the address names another tab", async () => {
        await showPage();
        expect(tab(/^Agent keys/).getAttribute("aria-selected")).toBe("true");
    });

    it("opens the tab named in the address", async () => {
        await showPage({ tab: "retention" });
        expect(tab(/^Retention/).getAttribute("aria-selected")).toBe("true");
        expect(tab(/^Agent keys/).getAttribute("aria-selected")).toBe("false");
    });
});
