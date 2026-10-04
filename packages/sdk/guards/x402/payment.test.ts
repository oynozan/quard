import { describe, expect, it } from "vitest";
import { PAYEE, requirementsOf, USDC } from "../../test/x402.ts";
import type { PaymentCreationContext } from "./client.ts";
import { cleanResource, paymentInput, readPayment } from "./payment.ts";

function contextOf(resource: unknown, chosen: Partial<PaymentCreationContext["selectedRequirements"]> = {}) {
    return {
        paymentRequired: { x402Version: 2, resource },
        selectedRequirements: { ...requirementsOf({ usd: 0.25 }), ...chosen },
    };
}

describe("readPayment", () => {
    it("reads a v2 payment with its USD value", () => {
        expect(readPayment(contextOf({ url: "https://api.paid.dev/a?q=1" }))).toEqual({
            x402Version: 2,
            scheme: "exact",
            network: "eip155:84532",
            asset: USDC,
            amount: "250000",
            validAmount: true,
            usd: 0.25,
            payTo: PAYEE,
            resource: "https://api.paid.dev/a?q=1",
            host: "api.paid.dev",
        });
    });

    it("reads the v1 amount and URL from the option", () => {
        const context = contextOf(undefined, {
            amount: undefined,
            maxAmountRequired: "5",
            resource: "https://v1.paid.dev/x",
        });

        expect(readPayment(context)).toMatchObject({ amount: "5", host: "v1.paid.dev" });
    });

    it("reads a URL given as text, and copes without one", () => {
        expect(readPayment(contextOf("https://text.paid.dev/")).host).toBe("text.paid.dev");
        expect(readPayment(contextOf(null))).toMatchObject({ resource: "", host: "" });
        expect(readPayment(contextOf({ url: 5 })).host).toBe("");
    });

    it("marks a broken amount and records it as 0", () => {
        for (const amount of ["-1", "1.5", "1e9", {}]) {
            const payment = readPayment(contextOf(undefined, { amount: amount as string }));

            expect(payment).toMatchObject({ amount: "0", validAmount: false, usd: 0 });
        }
    });

    it("reads a whole-number or hex amount as the signer does", () => {
        for (const amount of [1_000_000_000, "0x3B9ACA00"]) {
            const payment = readPayment(contextOf(undefined, { amount: amount as string }));

            expect(payment).toMatchObject({ amount: "1000000000", validAmount: true, usd: 1000 });
        }
    });

    it("has no USD value for an unknown token", () => {
        expect(readPayment(contextOf(undefined, { asset: "0xunknown" })).usd).toBeNull();
    });
});

describe("cleanResource", () => {
    it("removes secret query values and credentials", () => {
        expect(cleanResource("https://u:p@api.paid.dev/a?api_key=abc123&q=1")).toBe(
            "https://…@api.paid.dev/a?api_key=…&q=1",
        );
    });
});

describe("paymentInput", () => {
    it("keeps what the approver needs to see", () => {
        const payment = readPayment(contextOf({ url: "https://api.paid.dev/a" }));

        expect(Object.keys(paymentInput(payment))).toEqual([
            "host",
            "resource",
            "payTo",
            "amount",
            "asset",
            "usd",
            "network",
            "scheme",
        ]);
    });
});
