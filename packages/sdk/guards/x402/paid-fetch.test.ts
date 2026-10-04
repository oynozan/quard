import type { PaymentEvent, RunEvent } from "@quard/shared";
import { wrapFetchWithPayment } from "@x402/fetch";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { quard } from "../../index.ts";
import { decisionsOf } from "../../test/events.ts";
import { resetAll } from "../../test/reset.ts";
import { fakeClient, startPaidServer } from "../../test/x402.ts";
import type { X402Options } from "../options.ts";

let events: RunEvent[] = [];
let closers: Array<() => Promise<void>> = [];

beforeEach(() => {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
});

afterEach(async () => {
    resetAll();
    await Promise.all(closers.map((close) => close()));
    closers = [];
});

const payments = () => events.filter((event): event is PaymentEvent => event.type === "payment");

// A paid server, and a fetch that pays through x402Fetch with a guarded client
async function paidSetup(options: X402Options, url?: string) {
    const server = await startPaidServer({ usd: 0.01, ...(url === undefined ? {} : { url }) });
    closers.push(server.close);
    const { client, signed } = fakeClient();
    const pay = wrapFetchWithPayment(quard.x402Fetch(fetch), quard.x402(client, options));
    return { server, signed, pay };
}

describe("quard.x402 with quard.x402Fetch", () => {
    it("never sends a payment to another host than the one it checked", async () => {
        const options: X402Options = { type: "x402", blockHosts: ["127.0.0.1"] };
        const { server, pay } = await paidSetup(options, "https://api.trusted.dev/weather");

        const response = await pay(server.url);

        expect(response.status).toBe(403);
        expect(server.settled).toEqual([]);
        expect(payments().map((event) => [event.stage, event.reason])).toEqual([
            ["challenged", undefined],
            ["refused", "host_mismatch"],
        ]);
    });

    it("joins payments made outside a run to one run, so run caps hold in a retry loop", async () => {
        const { server, signed, pay } = await paidSetup({ type: "x402", maxPaymentsPerRun: 2 });

        const outcomes: Array<number | string> = [];
        for (let call = 0; call < 4; call++) {
            outcomes.push(
                await pay(server.url).then(
                    (response) => response.status,
                    (error: Error) => error.message,
                ),
            );
        }

        expect(outcomes.slice(0, 2)).toEqual([200, 200]);
        expect(outcomes[2]).toContain("this run made too many payments");
        expect(server.settled).toHaveLength(2);
        expect(signed).toHaveLength(2);
        const runs = new Set([...payments(), ...decisionsOf(events)].map((event) => event.runId));
        expect(runs.size).toBe(1);
    });
});
