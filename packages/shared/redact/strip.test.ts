import { describe, expect, it } from "vitest";
import { stripSecrets, tooDeepToStrip } from "./strip.ts";

// Built from parts, so no key-shaped text sits in the source
const KEY = ["sk-", "proj-", "a1B2c3D4e5F6g7H8i9J0kLmN"].join("");
const IBAN = "DE89370400440532013000";

describe("stripSecrets", () => {
    it("keeps IBANs, emails and amounts in full", () => {
        const args = { iban: IBAN, notify: "jane@acme.com", amount: 4950, paid: false, note: null };

        expect(stripSecrets(args)).toEqual(args);
    });

    it("removes secrets inside text and the values of secret fields", () => {
        expect(stripSecrets({ memo: `use ${KEY} now`, token: "abc", nested: [{ password: "hunter2" }] })).toEqual({
            memo: "use sk-proj-… now",
            token: "…",
            nested: [{ password: "…" }],
        });
    });

    it("removes a secret used as a field name", () => {
        expect(Object.keys(stripSecrets({ [KEY]: 1 }) as object)).toEqual(["sk-proj-…"]);
    });

    it("keeps nothing below the depth limit", () => {
        let deep: unknown = "x";
        for (let i = 0; i < 40; i++) {
            deep = [deep];
        }
        expect(JSON.stringify(stripSecrets(deep))).toContain('"…"');
        expect(JSON.stringify(stripSecrets(deep))).not.toContain('"x"');
    });
});

describe("tooDeepToStrip", () => {
    // An object nested this many levels deep
    function nested(levels: number, inner: unknown = "x"): unknown {
        let value = inner;
        for (let i = 0; i < levels; i++) {
            value = [value];
        }
        return value;
    }

    it("is true only when stripSecrets would cut something for its depth", () => {
        expect(tooDeepToStrip(nested(32))).toBe(false);
        expect(JSON.stringify(stripSecrets(nested(32)))).toContain('"x"');
        expect(tooDeepToStrip(nested(33))).toBe(true);
        expect(tooDeepToStrip({ list: [1, nested(32)] })).toBe(true);
        expect(tooDeepToStrip("x")).toBe(false);
    });

    it("leaves out secret fields, which lose their value anyway", () => {
        expect(tooDeepToStrip({ password: nested(40) })).toBe(false);
    });
});
