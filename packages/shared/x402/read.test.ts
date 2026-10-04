import { describe, expect, it } from "vitest";
import {
    decodeX402,
    hasPayment,
    paidOption,
    priceFrom,
    readPayment,
    readPrice,
    readSettlement,
    x402VersionOf,
} from "./read.ts";

const option = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
    extra: { name: "USDC" },
};
const v1Option = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "5000",
    resource: "https://api.example/data",
    description: "Data",
    mimeType: "application/json",
    outputSchema: {},
    payTo: "0x1",
    maxTimeoutSeconds: 30,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    extra: {},
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
const headers = (values: Record<string, string>) => (name: string) => values[name];

describe("decodeX402", () => {
    it("reads base64 JSON and nothing else", () => {
        expect(decodeX402(encode({ a: 1 }))).toEqual({ a: 1 });
        expect(decodeX402(` ${encode([1])} `)).toEqual([1]);
        expect(decodeX402(null)).toBeUndefined();
        expect(decodeX402(undefined)).toBeUndefined();
        expect(decodeX402("not base64!")).toBeUndefined();
        expect(decodeX402(Buffer.from("{broken").toString("base64"))).toBeUndefined();
    });
});

describe("readPrice", () => {
    it("reads the v2 header", () => {
        const price = { x402Version: 2, resource: { url: "https://api.example/data" }, accepts: [option] };
        expect(readPrice(headers({ "payment-required": encode(price) }))).toEqual(price);
    });

    it("reads a v1 body, with maxAmountRequired as the amount", () => {
        const price = readPrice(headers({}), { x402Version: 1, error: "pay", accepts: [v1Option] });
        expect(price?.x402Version).toBe(1);
        expect(price?.error).toBe("pay");
        expect(price?.accepts[0]).toEqual({
            scheme: "exact",
            network: "base-sepolia",
            amount: "5000",
            asset: v1Option.asset,
            payTo: "0x1",
            maxTimeoutSeconds: 30,
            extra: {},
        });
    });

    it("gives undefined for a price it can't read", () => {
        expect(readPrice(headers({ "payment-required": "%%%" }))).toBeUndefined();
        expect(priceFrom("text")).toBeUndefined();
        expect(priceFrom([])).toBeUndefined();
        expect(priceFrom({ x402Version: 2 })).toBeUndefined();
        expect(priceFrom({ x402Version: 2, accepts: [{ ...option, amount: "1.5" }] })).toBeUndefined();
        expect(priceFrom({ x402Version: 2, accepts: ["x"] })).toBeUndefined();
    });
});

describe("readPayment and hasPayment", () => {
    it("reads the v2 header, then the v1 header", () => {
        expect(readPayment(headers({ "payment-signature": encode({ x402Version: 2 }) }))).toEqual({ x402Version: 2 });
        expect(readPayment(headers({ "x-payment": encode({ x402Version: 1 }) }))).toEqual({ x402Version: 1 });
        expect(readPayment(headers({}))).toBeUndefined();
    });

    it("knows a payment header is there even when it can't be read", () => {
        expect(hasPayment(headers({ "x-payment": "%%%" }))).toBe(true);
        expect(hasPayment(headers({ "payment-signature": "" }))).toBe(true);
        expect(hasPayment((name) => (name === "x-payment" ? null : undefined))).toBe(false);
    });
});

describe("readSettlement", () => {
    it("reads the v2 header, then the v1 header", () => {
        const settled = { success: true, transaction: "0xabc", network: "eip155:84532", payer: "0x2" };
        expect(readSettlement(headers({ "payment-response": encode(settled) }))).toEqual(settled);
        const failed = { success: false, transaction: "", errorReason: "insufficient_funds", extra: 1 };
        expect(readSettlement(headers({ "x-payment-response": encode(failed) }))).toEqual({
            success: false,
            transaction: "",
            errorReason: "insufficient_funds",
        });
    });

    it("gives undefined for no header or a broken one", () => {
        expect(readSettlement(headers({}))).toBeUndefined();
        expect(readSettlement(headers({ "payment-response": encode({ transaction: "0x1" }) }))).toBeUndefined();
    });
});

describe("paidOption and x402VersionOf", () => {
    const price = {
        x402Version: 1,
        accepts: [
            { ...option, network: "base" },
            { ...option, network: "base-sepolia" },
        ],
    };

    it("takes a v2 payment's accepted option", () => {
        expect(paidOption({ x402Version: 2, accepted: option, payload: {} })).toEqual(option);
        expect(paidOption({ accepted: { ...option, amount: "x" } })).toBeUndefined();
    });

    it("finds a v1 payment's option in the price", () => {
        expect(paidOption({ x402Version: 1, scheme: "exact", network: "base-sepolia" }, price)).toEqual(
            price.accepts[1],
        );
        expect(paidOption({ x402Version: 1, scheme: "upto", network: "base" }, price)).toBeUndefined();
        expect(paidOption({ x402Version: 1, scheme: "exact", network: "base" })).toBeUndefined();
        expect(paidOption("payment")).toBeUndefined();
    });

    it("reads the version from the payment, then the price", () => {
        expect(x402VersionOf({ x402Version: 2 })).toBe(2);
        expect(x402VersionOf({ x402Version: 0 }, price)).toBe(1);
        expect(x402VersionOf({ x402Version: 1.5 }, { ...price, x402Version: 2 })).toBe(2);
        expect(x402VersionOf(undefined)).toBe(1);
    });
});
