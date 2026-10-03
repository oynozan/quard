import { describe, expect, it } from "vitest";
import { textOf } from "./text-of.ts";

describe("textOf", () => {
    it("returns text as it is", () => {
        expect(textOf("plain")).toBe("plain");
    });

    it("joins object keys, strings and numbers, one per line", () => {
        expect(textOf({ a: "x\ny", b: [2, { c: "z" }] })).toBe("a\nb\nc\nx\ny\n2\nz");
        expect(textOf(undefined)).toBe("");
    });

    it("stops at cycles", () => {
        const value: Record<string, unknown> = { key: "v" };
        value.self = value;

        expect(textOf(value)).toBe("key\nself\nv");
    });
});
