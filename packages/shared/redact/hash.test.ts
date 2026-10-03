import { describe, expect, it } from "vitest";
import { keyedHash, parseHashKey } from "./hash.ts";

const KEY = parseHashKey("ab".repeat(32));

describe("parseHashKey", () => {
    it("reads 64 hex characters as 32 bytes", () => {
        expect(KEY.length).toBe(32);
        expect(parseHashKey(` ${"AB".repeat(32)} `).equals(KEY)).toBe(true);
    });

    it.each(["", "ab".repeat(31), "zz".repeat(32)])("rejects %j", (text) => {
        expect(() => parseHashKey(text)).toThrow("64 hex characters");
    });
});

describe("keyedHash", () => {
    it("gives the same 32 hex characters for the same value", () => {
        const hash = keyedHash(KEY, "iban", "DE89370400440532013000");
        expect(hash).toMatch(/^[0-9a-f]{32}$/);
        expect(keyedHash(KEY, "iban", "DE89370400440532013000")).toBe(hash);
    });

    it("differs by kind and by key", () => {
        const hash = keyedHash(KEY, "iban", "x");
        expect(keyedHash(KEY, "email", "x")).not.toBe(hash);
        expect(keyedHash(parseHashKey("cd".repeat(32)), "iban", "x")).not.toBe(hash);
    });
});
