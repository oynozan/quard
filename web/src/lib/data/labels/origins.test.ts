// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPING, originKind } from "./origins";

describe("originKind", () => {
    it("reads the kind from the part before the first colon", () => {
        expect(originKind("web:docs.python.org")).toBe("web");
        expect(originKind("email:gmail.com")).toBe("email");
        expect(originKind("file:/srv/a:b")).toBe("file");
        expect(originKind("user")).toBe("user");
    });

    it("treats an unknown kind as unknown", () => {
        expect(originKind("ftp:files.example")).toBe("unknown");
        expect(originKind("")).toBe("unknown");
    });

    it("has no search or memory kind, like the SDK", () => {
        expect(originKind("search:hosted")).toBe("unknown");
        expect(originKind("memory:notes")).toBe("unknown");
    });

    it("ignores names every object carries, such as constructor", () => {
        expect(originKind("constructor:x")).toBe("unknown");
        expect(originKind("toString")).toBe("unknown");
    });
});

describe("DEFAULT_MAPPING", () => {
    it("matches the SDK's defaults for every kind", () => {
        expect(DEFAULT_MAPPING).toEqual({
            user: { trust: "trusted", sensitivity: "internal" },
            system: { trust: "trusted", sensitivity: "internal" },
            tool: { trust: "trusted", sensitivity: "internal" },
            web: { trust: "untrusted", sensitivity: "public" },
            email: { trust: "untrusted", sensitivity: "public" },
            mcp: { trust: "untrusted", sensitivity: "public" },
            file: { trust: "untrusted", sensitivity: "internal" },
            agent: { trust: "untrusted", sensitivity: "internal" },
            unknown: { trust: "untrusted", sensitivity: "internal" },
        });
    });
});
