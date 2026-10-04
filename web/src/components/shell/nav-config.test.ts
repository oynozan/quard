// @vitest-environment node
import { Search } from "lucide-react";
import { describe, expect, it } from "vitest";
import { isActive, pageTitle, PRIMARY_NAV, WORKSPACE_NAV, type NavItem } from "./nav-config";

const item = (href: string): NavItem => {
    const found = [...PRIMARY_NAV, ...WORKSPACE_NAV].find((entry) => entry.href === href);
    if (!found) throw new Error(`no nav item for ${href}`);
    return found;
};

describe("pageTitle", () => {
    it("names the overview only on the root path", () => {
        expect(pageTitle("/")).toBe("Overview");
    });

    it("names the section a nested path belongs to", () => {
        expect(pageTitle("/runs/abc123")).toBe("Runs");
        expect(pageTitle("/summary")).toBe("Summary");
        expect(pageTitle("/labels")).toBe("Labels");
        expect(pageTitle("/settings/keys")).toBe("Settings");
    });

    it("falls back to the product name for an unknown path", () => {
        expect(pageTitle("/nowhere")).toBe("Quard");
    });
});

describe("isActive", () => {
    it("marks the overview active only on the root path", () => {
        expect(isActive(item("/"), "/")).toBe(true);
        expect(isActive(item("/"), "/runs")).toBe(false);
    });

    it("marks a section active on its own nested pages", () => {
        expect(isActive(item("/approvals"), "/approvals/42")).toBe(true);
        expect(isActive(item("/approvals"), "/agents")).toBe(false);
    });

    it("never marks an external link active", () => {
        const docs: NavItem = { href: "/docs", label: "Docs", icon: Search, external: true };
        expect(isActive(docs, "/docs")).toBe(false);
    });
});
