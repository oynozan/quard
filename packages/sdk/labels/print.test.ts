import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../core/config.ts";
import { printOf } from "./print.ts";

const HASH_KEY = "ab".repeat(32);

afterEach(() => {
    resetConfig();
});

describe("printOf", () => {
    it("gives 64 hex characters", () => {
        expect(printOf("x")).toMatch(/^[0-9a-f]{64}$/);
        expect(printOf("x")).toBe(printOf("x"));
    });

    it("ignores the order of an object's keys", () => {
        expect(printOf({ a: 1, b: [true, null] })).toBe(printOf({ b: [true, null], a: 1 }));
    });

    it("gives what survives a JSON round trip the same print", () => {
        const at = new Date("2026-10-04T00:00:00.000Z");

        expect(printOf({ a: 1, b: undefined, f: () => 1 })).toBe(printOf({ a: 1 }));
        expect(printOf([undefined, Number.NaN])).toBe(printOf([null, null]));
        expect(printOf({ at })).toBe(printOf(JSON.parse(JSON.stringify({ at }))));
    });

    it.each([
        ["true and false", { ok: true }, { ok: false }],
        ["null and empty text", { note: null }, { note: "" }],
        ["an empty list and an empty object", { to: [] }, { to: {} }],
        ["values under swapped keys", { to: ["a"], cc: [] }, { to: [], cc: ["a"] }],
        ["a list and its items in another order", [1, 2], [2, 1]],
        ["a number and its text", 1, "1"],
        ["a big number and a number", 1n, 1],
        ["text with a hidden mark", "pay", `pay${String.fromCodePoint(0x200b)}`],
        ["text with other spacing", "a b", "a  b"],
        ["nothing and empty text", undefined, ""],
    ])("tells %s apart", (_name, a, b) => {
        expect(printOf(a)).not.toBe(printOf(b));
    });

    it("prints a value that holds itself", () => {
        const loop: Record<string, unknown> = { a: 1 };
        loop.self = loop;

        expect(printOf(loop)).toMatch(/^[0-9a-f]{64}$/);
        expect(printOf(loop)).not.toBe(printOf({ a: 1, self: {} }));
    });

    it("prints a value held twice in full each time", () => {
        const shared = { x: 1 };

        expect(printOf({ a: shared, b: shared })).toBe(printOf({ a: { x: 1 }, b: { x: 1 } }));
    });
});

describe("printOf keys", () => {
    it("is not a plain hash of the content", () => {
        const plain = (text: string) => createHash("sha256").update(text).digest("hex");

        expect([plain("bob@acme.com"), plain('"bob@acme.com"')]).not.toContain(printOf("bob@acme.com"));
    });

    it("goes by the install's hash key once one is set", () => {
        const before = printOf("bob@acme.com");
        configure({ hashKey: HASH_KEY });
        const first = printOf("bob@acme.com");
        configure({ hashKey: "cd".repeat(32) });
        const other = printOf("bob@acme.com");
        configure({ hashKey: HASH_KEY });

        expect(printOf("bob@acme.com")).toBe(first);
        expect(new Set([before, first, other]).size).toBe(3);
    });

    it("gives another process with the same key the same print", () => {
        configure({ hashKey: HASH_KEY });
        const expected = createHmac("sha256", Buffer.from(HASH_KEY, "hex")).update('print:"x"').digest("hex");

        expect(printOf("x")).toBe(expected);
        expect(printOf("x")).toBe(expected);
    });
});
