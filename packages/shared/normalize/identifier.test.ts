import { describe, expect, it } from "vitest";
import { findIds, isIdentifierLike } from "./identifier.ts";

describe("isIdentifierLike", () => {
    it.each(["INV-2026-0042", "order_12345678", "a1b2c3d4"])("accepts %s", (value) => {
        expect(isIdentifierLike(value)).toBe(true);
    });

    it.each(["short1", "no digits here", "Accounts", "2026-10-03", "03-10-2026", "has space 12345678"])(
        "rejects %s",
        (value) => {
            expect(isIdentifierLike(value)).toBe(false);
        },
    );
});

describe("findIds", () => {
    it("finds ID-like tokens on word boundaries", () => {
        expect(findIds("Invoice INV-2026-0042 dated 2026-10-03 for Accounts 4950")).toEqual(["inv-2026-0042"]);
    });
});
