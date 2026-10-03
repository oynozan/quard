import { describe, expect, it } from "vitest";
import { canonicalJson, plainJson } from "./canonical.ts";

describe("canonicalJson", () => {
    it("gives the same text whatever the key order", () => {
        expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
            canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
        );
    });

    it("sorts keys by code point, whatever the locale", () => {
        expect(canonicalJson({ a: 1, B: 2, é: 3, z: 4, Z: 5 })).toBe('{"B":2,"Z":5,"a":1,"z":4,"é":3}');
        expect(canonicalJson({ same: 1, same2: 2 })).toBe('{"same":1,"same2":2}');
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

describe("plainJson", () => {
    it("turns values JSON cannot hold into plain data", () => {
        expect(plainJson({ b: 2n, a: new Set(["y", "x"]), when: new Date(0) })).toEqual({
            a: { set: ['"x"', '"y"'] },
            b: "2n",
            when: { json: "1970-01-01T00:00:00.000Z" },
        });
    });
});
