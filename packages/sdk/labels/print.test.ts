import { describe, expect, it } from "vitest";
import { printOf } from "./print.ts";

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
