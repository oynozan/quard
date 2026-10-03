import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { policyVersion, signatureFeed } from "../policy/state.ts";
import { EXAMPLES, tempDir, writeJson } from "../test/files.ts";
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

    it("rejects invalid options and keeps the config it had", () => {
        configure({ origins: { user: { trust: "untrusted" } } });

        expect(() => configure({ signatures: { file: "f.json", url: "https://feeds.example.com/s.json" } })).toThrow(
            TypeError,
        );
        expect(() => configure({ detector: { name: "fake" } as never })).toThrow("Invalid Quard configuration");
        expect(getConfig()).toEqual({ origins: { user: { trust: "untrusted" } } });
    });

    it("opens the policy file, whose origins win over the code's", () => {
        const path = writeJson(join(tempDir(), "p.json"), { version: 1, origins: { "mcp:crm": { trust: "trusted" } } });

        configure({ origins: { "mcp:crm": { trust: "untrusted" }, user: { trust: "untrusted" } }, policyFile: path });
        configure({ onEvent: () => undefined });

        expect(policyVersion()).toBe("1");
        expect(getConfig().origins).toEqual({ "mcp:crm": { trust: "trusted" }, user: { trust: "untrusted" } });
    });

    it("opens a signature feed set in code", () => {
        configure({ signatures: { file: join(EXAMPLES, "signatures", "signatures.json") } });

        expect(signatureFeed()?.signatures).toHaveLength(13);
    });

    it("throws on a broken policy file and keeps the config it had", () => {
        const path = writeJson(join(tempDir(), "p.json"), "{ broken");

        expect(() => configure({ policyFile: path })).toThrow("Quard could not load the policy file");
        expect(getConfig()).toEqual({ origins: {} });
    });

    it("closes the policy file on reset", () => {
        configure({ policyFile: writeJson(join(tempDir(), "p.json"), { version: 1 }) });

        resetConfig();

        expect(policyVersion()).toBeUndefined();
    });
});
