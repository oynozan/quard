import type { PaymentEvent, PaymentRequired, RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quard } from "../../index.ts";
import { resetAll } from "../../test/reset.ts";
import { v2Options } from "../../test/x402/facilitator.ts";
import { paidStep, recordPrice, recordRejected, recordSettlement, recordSigned, scopeFor } from "./payments.ts";

let events: RunEvent[] = [];
const payments = () => events.filter((event): event is PaymentEvent => event.type === "payment");

const price: PaymentRequired = { x402Version: 1, accepts: [{ ...v2Options[0]!, network: "base-sepolia" }] };
const v1Payment = { x402Version: 1, scheme: "exact", network: "base-sepolia", payload: {} };
const place = (key: string) => ({ key, host: "h".repeat(600), resource: "r".repeat(2500) });

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(resetAll);

describe("payment records", () => {
    it("cuts long hosts, resources and reasons to fit the event", () => {
        recordPrice(place("a"), price);
        const step = paidStep(place("a"), v1Payment);
        recordSettlement(step, { success: false, errorReason: "x".repeat(300) }, false);
        const [challenged, failed] = payments();
        expect(challenged?.host).toHaveLength(500);
        expect(challenged?.resource).toHaveLength(2000);
        expect(failed?.reason).toHaveLength(100);
    });

    it("names a reason when the server gave none", () => {
        recordPrice(place("a"), price);
        recordSettlement(paidStep(place("a"), v1Payment), { success: false }, false);
        recordRejected(paidStep(place("a"), v1Payment), undefined);
        expect(payments().map((event) => event.reason)).toEqual([undefined, "settle_failed", "payment_rejected"]);
    });

    it("keeps the signed amount when the settled one is not whole atomic units", () => {
        recordPrice(place("a"), price);
        recordSettlement(paidStep(place("a"), v1Payment), { success: true, transaction: "0x1", amount: "1.5" }, true);
        expect(payments().at(-1)).toMatchObject({ amount: "10000", transaction: "0x1", delivered: true });
    });

    it("records nothing for a payment whose option is unknown", () => {
        recordSigned(paidStep(place("b"), v1Payment));
        expect(payments()).toEqual([]);
    });

    it("keeps the newest 1,000 prices", () => {
        quard.run({}, () => {
            for (let i = 0; i <= 1_000; i++) {
                recordPrice(place(`k${i}`), price);
            }
        });
        events = [];
        expect(paidStep(place("k0"), v1Payment).option).toBeUndefined();
        expect(paidStep(place("k1000"), v1Payment).option).toBeDefined();
        const run = scopeFor(place("k1")).run;
        expect(scopeFor(place("k1000")).run).toBe(run);
    });
});
