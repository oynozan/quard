import { describe, expect, it } from "vitest";
import { atomicAmount } from "./amount.ts";

describe("atomicAmount", () => {
    it("keeps a decimal string", () => {
        expect(atomicAmount("10000")).toBe("10000");
        expect(atomicAmount("0")).toBe("0");
    });

    it("reads a safe whole number and a hex string, as a signer does", () => {
        expect(atomicAmount(1_000_000_000)).toBe("1000000000");
        expect(atomicAmount("0x3B9ACA00")).toBe("1000000000");
        expect(atomicAmount(" 42 ")).toBe("42");
    });

    it("reads nothing else", () => {
        const broken = [-1, 1.5, 2 ** 60, "", "  ", "-5", "1.5", "1e9", "abc", undefined, null, {}, "9".repeat(79)];
        for (const value of [...broken, "1".repeat(201)]) {
            expect(atomicAmount(value)).toBeUndefined();
        }
    });
});
