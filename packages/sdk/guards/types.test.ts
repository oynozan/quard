import { describe, expect, it } from "vitest";
import { GUARD_TYPES, isGuardType } from "./types.ts";

describe("guard types", () => {
    it("lists the six guard types", () => {
        expect(GUARD_TYPES).toEqual(["source", "action", "approval", "egress", "limit", "x402"]);
    });

    it.each(GUARD_TYPES)("accepts %s", (type) => {
        expect(isGuardType(type)).toBe(true);
    });

    it.each(["block", "", 5, null, undefined])("rejects %s", (value) => {
        expect(isGuardType(value)).toBe(false);
    });
});
