import type { PaymentEvent, RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { quard } from "../../index.ts";
import { resetAll } from "../../test/reset.ts";
import { fakeClient, priceOf } from "../../test/x402.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
});

afterEach(resetAll);

const payments = () => events.filter((event): event is PaymentEvent => event.type === "payment");

describe("quard.x402 and amounts", () => {
    it("reads an amount sent as a number, so the run cap still holds", async () => {
        const { client, signed } = fakeClient();
        quard.x402(client, { type: "x402", maxPerRun: 1 });

        const price = priceOf({ amount: 1_000_000_000 as unknown as string });
        await expect(client.createPaymentPayload(price)).rejects.toThrow("the payment is over the run limit");

        expect(signed).toEqual([]);
        expect(payments()[0]).toMatchObject({ amount: "1000000000", usd: 1000 });
    });

    it("refuses an amount it can't read, even in observe mode", async () => {
        const { client, signed } = fakeClient();
        quard.x402(client, { type: "x402", mode: "observe" });

        await expect(client.createPaymentPayload(priceOf({ amount: "1e9" }))).rejects.toThrow(
            "the payment amount could not be read",
        );

        expect(signed).toEqual([]);
        expect(payments()[0]).toMatchObject({ amount: "0", reason: "x402_invalid_amount" });
    });
});
