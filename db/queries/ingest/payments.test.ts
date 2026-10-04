import { describe, expect, it } from "vitest";
import { item, payment, RUN, started } from "../../test/events.ts";
import { paymentRows } from "./payments.ts";

const PROJECT = "00000000-0000-0000-0000-000000000001";

describe("paymentRows", () => {
    it("keeps every field of a payment event, wallets in clear", () => {
        const settled = item(payment({ delivered: false, reason: "http_500" }));

        expect(paymentRows(PROJECT, [item(started()), settled])).toEqual([
            {
                project_id: PROJECT,
                event_id: settled.id,
                run_id: RUN,
                step_id: "8".repeat(16),
                agent: "billing",
                stage: "settled",
                host: "api.example.com",
                resource: "https://api.example.com/report",
                x402_version: 2,
                scheme: "exact",
                network: "eip155:8453",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                amount: "50000",
                usd: 0.05,
                pay_to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                tx_hash: "0x" + "ab".repeat(32),
                delivered: false,
                reason: "http_500",
                at: "2026-10-03T12:00:07.000Z",
            },
        ]);
    });

    it("stores missing transaction, delivery and reason as null", () => {
        const challenged = item(payment({ stage: "challenged", usd: null, transaction: undefined }));

        expect(paymentRows(PROJECT, [challenged])[0]).toMatchObject({
            stage: "challenged",
            usd: null,
            tx_hash: null,
            delivered: null,
            reason: null,
        });
    });
});
