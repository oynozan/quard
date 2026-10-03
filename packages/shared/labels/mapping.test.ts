import { describe, expect, it } from "vitest";
import { labelFor, originKind } from "./mapping.ts";

describe("originKind", () => {
    it.each([
        ["user", "user"],
        ["tool:getSupplier", "tool"],
        ["web:evil.com", "web"],
        ["mcp:crm.acme.internal", "mcp"],
        ["something:else", "unknown"],
        ["toString", "unknown"],
    ])("reads %s as %s", (origin, kind) => {
        expect(originKind(origin)).toBe(kind);
    });
});

describe("labelFor", () => {
    it("uses the default mapping", () => {
        expect(labelFor("user")).toEqual({
            origin: "user",
            kind: "user",
            trust: "trusted",
            sensitivity: "internal",
            flags: [],
        });
        expect(labelFor("web:evil.com")).toMatchObject({ trust: "untrusted", sensitivity: "public" });
        expect(labelFor("file:/tmp/a.txt")).toMatchObject({ trust: "untrusted", sensitivity: "internal" });
        expect(labelFor("odd")).toMatchObject({ kind: "unknown", trust: "untrusted", sensitivity: "internal" });
    });

    it("applies an override for the exact origin only", () => {
        const overrides = { "mcp:crm.acme.internal": { trust: "trusted" as const, sensitivity: "internal" as const } };

        expect(labelFor("mcp:crm.acme.internal", overrides)).toMatchObject({
            trust: "trusted",
            sensitivity: "internal",
        });
        expect(labelFor("mcp:other", overrides)).toMatchObject({ trust: "untrusted", sensitivity: "public" });
    });

    it("keeps the default for fields an override leaves out", () => {
        const overrides = { user: { trust: "untrusted" as const } };

        expect(labelFor("user", overrides)).toMatchObject({ trust: "untrusted", sensitivity: "internal" });
    });

    it("carries flags", () => {
        expect(labelFor("web:a.com", {}, ["instructions"]).flags).toEqual(["instructions"]);
    });
});
