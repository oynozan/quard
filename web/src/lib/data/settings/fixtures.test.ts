// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW, DAY } from "../rng";
import { agentKeys, keyPrefix, RETENTION } from "./fixtures";

describe("agentKeys", () => {
    it("shows each key's prefix and never its full secret", () => {
        const keys = agentKeys();
        expect(keys.map((key) => key.prefix)).toEqual([
            "qk_live_7f31…",
            "qk_live_2c8e…",
            "qk_live_a40d…",
            "qk_live_91be…",
            "qk_test_5f02…",
            "qk_live_0e77…",
        ]);
        expect(keys.some((key) => "secret" in key)).toBe(false);
    });

    it("keeps who revoked an old key and when", () => {
        const old = agentKeys().find((key) => key.id === "key_0e77");
        expect(old).toMatchObject({ revokedAt: NOW - 61 * DAY, revokedBy: "dana@acme.com" });
    });
});

describe("keyPrefix", () => {
    it("gives a key's prefix by id", () => {
        expect(keyPrefix("key_a40d")).toBe("qk_live_a40d…");
    });

    it("gives a dash for an unknown key", () => {
        expect(keyPrefix("key_none")).toBe("—");
    });
});

describe("RETENTION", () => {
    it("keeps runs 30 days and runs tied to an incident a year", () => {
        expect(RETENTION.slice(0, 2).map(({ item, days }) => [item, days])).toEqual([
            ["Runs", 30],
            ["Runs tied to an incident", 365],
        ]);
    });
});
