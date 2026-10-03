import { describe, expect, it } from "vitest";
import { hashToken, keyPrefix, newAgentKey } from "./tokens.ts";

describe("tokens", () => {
    it("hashes a key the same way each time", () => {
        const key = newAgentKey();

        expect(newAgentKey()).not.toBe(key);
        expect(hashToken(key)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashToken(key)).toBe(hashToken(key));
    });

    it("makes agent keys in the dashboard's shape, with a short prefix to show", () => {
        const key = newAgentKey();

        expect(key).toMatch(/^qk_live_[0-9a-f]{48}$/);
        expect(keyPrefix(key)).toBe(key.slice(0, 12));
    });
});
