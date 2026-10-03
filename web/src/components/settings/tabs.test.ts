// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAGE_LIST } from "@/components/kit/page";
import { pickTab, SETTINGS_CONTAINER, SETTINGS_TABS } from "./tabs";

describe("SETTINGS_TABS", () => {
    it("lists the four sections in order, agent keys first", () => {
        expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual([
            "Agent keys",
            "Accounts",
            "Retention",
            "Rules from code",
        ]);
    });
});

describe("pickTab", () => {
    it("returns a known tab", () => {
        expect(pickTab("retention")).toBe("retention");
    });

    it("uses the first value when the address repeats the parameter", () => {
        expect(pickTab(["code", "accounts"])).toBe("code");
    });

    it("falls back to agent keys when the tab is missing or unknown", () => {
        expect(pickTab(undefined)).toBe("keys");
        expect(pickTab("billing")).toBe("keys");
        expect(pickTab([])).toBe("keys");
    });
});

describe("SETTINGS_CONTAINER", () => {
    it("uses the shared list-page container", () => {
        expect(SETTINGS_CONTAINER).toBe(PAGE_LIST);
    });
});
