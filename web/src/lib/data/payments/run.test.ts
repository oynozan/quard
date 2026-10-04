// @vitest-environment node
import type { PaymentRow } from "@quard/db";
import { describe, expect, it } from "vitest";
import { paymentsOf } from "./run";

const A = "a".repeat(16);
const B = "b".repeat(16);
const T = Date.UTC(2026, 9, 3, 12);

let next = 0;

function row(stepId: string, seconds: number, fields: Partial<PaymentRow> = {}): PaymentRow {
    next += 1;
    return {
        eventId: String(next),
        stepId,
        agent: "billing",
        stage: "challenged",
        host: "api.example.com",
        resource: "https://api.example.com/data",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        asset: "0xusdc",
        amount: "10000",
        usd: 0.01,
        payTo: "0xpayee",
        txHash: null,
        delivered: null,
        reason: null,
        at: new Date(T + seconds * 1000),
        ...fields,
    };
}

describe("paymentsOf", () => {
    it("folds each step's events into the furthest stage, oldest step first", () => {
        const payments = paymentsOf([
            row(B, 0),
            row(A, -5),
            row(A, -4, { stage: "signed", amount: "20000" }),
            row(A, -3, { stage: "settled", txHash: "0xabc" }),
            // A late event without the hash keeps the one seen before
            row(A, -2, { stage: "settled", delivered: false }),
        ]);

        expect(payments.map((payment) => payment.stepId)).toEqual([A, B]);
        expect(payments[0]).toMatchObject({
            stage: "settled",
            startedAt: T - 5000,
            at: T - 2000,
            amount: "10000",
            txHash: "0xabc",
            delivered: false,
        });
        expect(payments[0]).not.toHaveProperty("eventId");
        expect(payments[1]).toMatchObject({ stage: "challenged", startedAt: T, at: T });
    });

    it("keeps the further stage when events arrive out of order or at the same time", () => {
        const [payment] = paymentsOf([
            row(A, 1, { stage: "refused", reason: "over_run_limit" }),
            row(A, 0),
            row(A, 1, { stage: "challenged" }),
        ]);

        expect(payment).toMatchObject({ stage: "refused", reason: "over_run_limit", startedAt: T, at: T + 1000 });
    });
});
