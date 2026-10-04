import { describe, expect, it } from "vitest";
import { usdValue } from "./stablecoins.ts";

describe("usdValue", () => {
    it("values USDC on any listed chain, in any letter case", () => {
        expect(usdValue("0x036CbD53842c5426634e7929541eC2318f3dCF7e", "10000")).toBe(0.01);
        expect(usdValue("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "2500000")).toBe(2.5);
    });

    it("is null for an unknown token or a broken amount", () => {
        expect(usdValue("0x0000000000000000000000000000000000000001", "1")).toBeNull();
        expect(usdValue("0x036cbd53842c5426634e7929541ec2318f3dcf7e", "1.5")).toBeNull();
    });
});
