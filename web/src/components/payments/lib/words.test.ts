// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makePayment } from "../../../../test/payments/spend";
import { notDelivered, paymentState, shortAddress } from "./words";

describe("shortAddress", () => {
    it("keeps the start and end of a long address", () => {
        expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
        expect(shortAddress("short-value")).toBe("short-value");
    });
});

describe("paymentState", () => {
    it("names each stage with its status square", () => {
        const of = (fields: Parameters<typeof makePayment>[0]) => paymentState(makePayment(fields));
        expect(of({ stage: "challenged" })).toEqual({ word: "Price asked", tone: "off" });
        expect(of({ stage: "refused" })).toEqual({ word: "Refused", tone: "danger" });
        expect(of({ stage: "signed" })).toEqual({ word: "Signed", tone: "context" });
        expect(of({ stage: "settled", delivered: null })).toEqual({ word: "Settled", tone: "context" });
        expect(of({ stage: "failed" })).toEqual({ word: "Failed", tone: "danger" });
        expect(of({ stage: "settled", delivered: false })).toEqual({ word: "Paid, not delivered", tone: "warning" });
    });

    it("flags only settled payments whose response was an error", () => {
        expect(notDelivered(makePayment({ delivered: false }))).toBe(true);
        expect(notDelivered(makePayment({ delivered: true }))).toBe(false);
        expect(notDelivered(makePayment({ stage: "failed", delivered: false }))).toBe(false);
    });
});
