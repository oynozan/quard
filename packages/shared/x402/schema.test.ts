import { describe, expect, it } from "vitest";
import { paymentRequired, paymentResponse } from "./schema.ts";

const option = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
};

describe("x402 schemas", () => {
    it("reads a price and a settlement", () => {
        const required = { x402Version: 2, resource: { url: "https://api.example/data" }, accepts: [option] };
        expect(paymentRequired.parse(required)).toEqual(required);
        const settled = { success: true, transaction: "0xabc", network: "eip155:84532", payer: "0x1" };
        expect(paymentResponse.parse(settled)).toEqual(settled);
    });

    it("refuses an amount that is not whole atomic units, and a price with no options", () => {
        expect(paymentRequired.safeParse({ x402Version: 2, accepts: [{ ...option, amount: "0.01" }] }).success).toBe(
            false,
        );
        expect(paymentRequired.safeParse({ x402Version: 2, accepts: [] }).success).toBe(false);
    });

    it("reads a whole-number or hex amount as atomic units", () => {
        const accepts = [
            { ...option, amount: 1_000_000_000 },
            { ...option, amount: "0x3B9ACA00" },
        ];
        const parsed = paymentRequired.parse({ x402Version: 2, accepts });
        expect(parsed.accepts.map((entry) => entry.amount)).toEqual(["1000000000", "1000000000"]);
    });
});
