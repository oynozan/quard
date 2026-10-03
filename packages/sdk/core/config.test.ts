import { afterEach, describe, expect, it } from "vitest";
import { configure, getConfig, resetConfig } from "./config.ts";

afterEach(() => {
    resetConfig();
});

describe("config", () => {
    it("starts empty", () => {
        expect(getConfig()).toEqual({ origins: {} });
    });

    it("merges origin overrides across calls", () => {
        configure({ origins: { "mcp:a": { trust: "trusted" } } });
        configure({ origins: { "mcp:b": { trust: "trusted" } } });

        expect(Object.keys(getConfig().origins)).toEqual(["mcp:a", "mcp:b"]);
    });

    it("keeps overrides when other options change", () => {
        const onEvent = () => {};
        configure({ origins: { user: { trust: "untrusted" } } });
        configure({ onEvent });

        expect(getConfig()).toEqual({ origins: { user: { trust: "untrusted" } }, onEvent });
    });
});
