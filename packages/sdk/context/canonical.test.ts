import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.ts";

describe("canonicalJson", () => {
    it("gives the same text whatever the key order", () => {
        expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
            canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
        );
    });

    it("handles plain values", () => {
        expect(canonicalJson("x")).toBe('"x"');
        expect(canonicalJson(undefined)).toBe("undefined");
    });

    it("keeps the content of dates, URLs, maps, sets and big integers", () => {
        expect(canonicalJson({ when: new Date(0) })).not.toBe(canonicalJson({ when: new Date(1) }));
        expect(canonicalJson(new URL("https://bank.example/1"))).not.toBe(
            canonicalJson(new URL("https://evil.example/1")),
        );
        expect(
            canonicalJson(
                new Map([
                    ["b", 2],
                    ["a", 1],
                ]),
            ),
        ).toBe(
            canonicalJson(
                new Map([
                    ["a", 1],
                    ["b", 2],
                ]),
            ),
        );
        expect(canonicalJson(new Set([2, 1]))).toBe(canonicalJson(new Set([1, 2])));
        expect(canonicalJson({ amount: 10n })).toBe('{"amount":"10n"}');
    });

    it("stops at cycles instead of throwing", () => {
        const value: Record<string, unknown> = { a: 1 };
        value.self = value;

        expect(canonicalJson(value)).toBe('{"a":1,"self":"[seen]"}');
    });
});
