import type { PaymentEvent, RunEvent } from "@quard/shared";
import { wrapFetchWithPayment } from "@x402/fetch";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { quard } from "../../index.ts";
import { resetAll } from "../../test/reset.ts";
import { testClient } from "../../test/x402/client.ts";
import { PAYEE, USDC_SEPOLIA, v2Options } from "../../test/x402/facilitator.ts";
import { startX402Server, type X402Server } from "../../test/x402/server.ts";
import { markChecked } from "../checked.ts";
import { HOST_MISMATCH_TEXT, UNGUARDED_TEXT } from "../refusal.ts";

let server: X402Server;
let events: RunEvent[] = [];

const payments = () => events.filter((event): event is PaymentEvent => event.type === "payment");
const stages = () => payments().map((event) => event.stage);

beforeAll(async () => {
    server = await startX402Server();
});

afterAll(async () => {
    await server.close();
});

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
    server.paid.length = 0;
    Object.assign(server.facilitator.state, {
        settled: 0,
        invalid: undefined,
        settleError: undefined,
        amount: undefined,
    });
});

const paidFetch = (guarded = true) => wrapFetchWithPayment(quard.x402Fetch(fetch), testClient(guarded));

describe("x402Fetch with a v2 server", () => {
    it("records the price, the payment and the settlement in the run", async () => {
        const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";
        const response = await quard.run({ agent: "buyer" }, () => paidFetch()(`${server.url}/v2/data?key=${secret}`));
        expect(await response.json()).toEqual({ data: "paid content" });
        expect(stages()).toEqual(["challenged", "signed", "settled"]);
        const [challenged, signed, settled] = payments();
        expect(challenged).toMatchObject({
            agent: "buyer",
            host: "127.0.0.1",
            x402Version: 2,
            scheme: "exact",
            network: "eip155:84532",
            asset: USDC_SEPOLIA,
            amount: "10000",
            usd: 0.01,
            payTo: PAYEE,
        });
        expect(challenged?.resource).not.toContain(secret);
        expect(challenged?.resource).toContain("/v2/data?key=");
        expect(signed?.stepId).toBe(settled?.stepId);
        expect(signed?.stepId).not.toBe(challenged?.stepId);
        expect(settled).toMatchObject({ transaction: `0x${"1".padStart(64, "0")}`, delivered: true });
        expect(new Set(payments().map((event) => event.runId)).size).toBe(1);
        expect(events.some((event) => event.type === "warning")).toBe(false);
    });

    it("flags a settled payment whose response is an error as paid, not delivered", async () => {
        const response = await quard.run({}, () => paidFetch()(`${server.url}/v2/broken`));
        expect(response.status).toBe(500);
        expect(payments().at(-1)).toMatchObject({ stage: "settled", delivered: false });
    });

    it("records a failed settlement with its reason", async () => {
        server.facilitator.state.settleError = "insufficient_funds";
        const response = await quard.run({}, () => paidFetch()(`${server.url}/v2/data`));
        expect(response.status).toBe(402);
        expect(stages()).toEqual(["challenged", "signed", "failed"]);
        expect(payments().at(-1)).toMatchObject({ reason: "insufficient_funds" });
        expect(payments().at(-1)?.transaction).toBeUndefined();
    });

    it("records a payment the server turned down with a new price as failed", async () => {
        server.facilitator.state.invalid = "invalid_exact_evm_payload_signature";
        await quard.run({}, () => paidFetch()(`${server.url}/v2/data`));
        expect(stages()).toEqual(["challenged", "signed", "failed"]);
        expect(payments().at(-1)?.reason).toBe("invalid_exact_evm_payload_signature");
    });

    it("records the amount an upto payment settled", async () => {
        server.facilitator.state.amount = "4000";
        await quard.run({}, () => paidFetch()(`${server.url}/v2/data`));
        expect(payments().at(-1)).toMatchObject({ stage: "settled", amount: "4000", usd: 0.004 });
    });

    it("keeps only the signed payment when the server sends no settlement", async () => {
        const response = await quard.run({}, () => paidFetch()(`${server.url}/v2/silent`));
        expect(response.status).toBe(200);
        expect(stages()).toEqual(["challenged", "signed"]);
    });

    it("joins a payment made outside a run to the run that saw its price", async () => {
        await paidFetch()(`${server.url}/v2/data`);
        expect(stages()).toEqual(["challenged", "signed", "settled"]);
        expect(new Set(payments().map((event) => event.runId)).size).toBe(1);
    });
});

describe("x402Fetch with a v1 server", () => {
    it("reads the price from the body and the settlement from X-PAYMENT-RESPONSE", async () => {
        const response = await quard.run({}, () => paidFetch()(`${server.url}/v1/data`));
        expect(response.status).toBe(200);
        expect(stages()).toEqual(["challenged", "signed", "settled"]);
        for (const event of payments()) {
            expect(event).toMatchObject({ x402Version: 1, network: "base-sepolia", amount: "5000", usd: 0.005 });
        }
    });

    it("records a payment turned down with a v1 price body as failed", async () => {
        server.facilitator.state.invalid = "invalid_payment";
        await quard.run({}, () => paidFetch()(`${server.url}/v1/data`));
        expect(payments().at(-1)).toMatchObject({ stage: "failed", reason: "invalid_payment" });
    });

    it("sends a checked v1 payment with no price seen, without a record", async () => {
        const payment = { x402Version: 1, scheme: "exact", network: "base-sepolia", payload: { signature: "0xfake" } };
        markChecked(payment, "127.0.0.1");
        const header = Buffer.from(JSON.stringify(payment)).toString("base64");
        const response = await quard.x402Fetch(fetch)(`${server.url}/v1/data`, { headers: { "X-PAYMENT": header } });
        expect(response.status).toBe(200);
        expect(server.paid).toEqual(["/v1/data"]);
        expect(payments()).toEqual([]);
    });
});

describe("x402Fetch and payments no guard checked", () => {
    it("keeps the payment back, answers with a refusal and warns once", async () => {
        const pay = paidFetch(false);
        const first = await quard.run({}, () => pay(`${server.url}/v2/data`));
        const second = await quard.run({}, () => pay(`${server.url}/v2/data`));
        expect(first.status).toBe(403);
        expect(await first.json()).toMatchObject({ error: { message: UNGUARDED_TEXT, code: "unguarded_x402" } });
        expect(second.status).toBe(403);
        expect(server.paid).toEqual([]);
        expect(server.facilitator.state.settled).toBe(0);
        expect(stages()).toEqual(["challenged", "refused", "challenged", "refused"]);
        expect(payments()[1]).toMatchObject({ reason: "unguarded", amount: "10000" });
        const warnings = events.filter((event) => event.type === "warning");
        expect(warnings).toEqual([expect.objectContaining({ code: "unguarded_x402" })]);
    });

    it("keeps back a payment header it can't read", async () => {
        const request = new Request(`${server.url}/v2/data`, { headers: { "PAYMENT-SIGNATURE": "%%%" } });
        const response = await quard.x402Fetch(fetch)(request);
        expect(response.status).toBe(403);
        expect(server.paid).toEqual([]);
        expect(payments()).toEqual([]);
        expect(events.filter((event) => event.type === "warning")).toHaveLength(1);
    });

    it("keeps back a payment the guard checked for another host", async () => {
        const payment = { x402Version: 2, accepted: v2Options[0], payload: { signature: "0xfake" } };
        markChecked(payment, "api.trusted.dev");
        const headers = { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64") };
        const response = await quard.x402Fetch(fetch)(`${server.url}/v2/data`, { headers });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { message: HOST_MISMATCH_TEXT } });
        expect(server.paid).toEqual([]);
        expect(payments()).toEqual([
            expect.objectContaining({ stage: "refused", reason: "host_mismatch", host: "127.0.0.1" }),
        ]);
        expect(events.some((event) => event.type === "warning")).toBe(false);
    });
});

describe("x402Fetch and other responses", () => {
    it("passes free requests and unreadable prices through without a record", async () => {
        const x402Fetch = quard.x402Fetch(fetch);
        expect((await x402Fetch(`${server.url}/free`)).status).toBe(200);
        const odd = quard.x402Fetch(async () => new Response("not json", { status: 402 }));
        expect(await (await odd("https://api.example/odd")).text()).toBe("not json");
        expect(payments()).toEqual([]);
    });
});
