import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import {
    decodePaymentSignatureHeader,
    encodePaymentRequiredHeader,
    encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";

// x402 on a test network, with a fake signer and no real chain

export const NETWORK = "eip155:84532";
// USDC on Base Sepolia, 6 decimals
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

// A real x402Client with a fake "exact" scheme that signs nothing
export function fakeClient() {
    const signed: PaymentRequirements[] = [];
    const scheme = {
        scheme: "exact",
        createPaymentPayload: async (x402Version: number, requirements: PaymentRequirements) => {
            signed.push(requirements);
            return { x402Version, payload: { signature: "0xfake", nonce: randomUUID() } };
        },
    };
    const client = new x402Client().setSpendControls(false);
    client.register(NETWORK, scheme);
    client.registerV1("base-sepolia", scheme);
    return { client, signed };
}

export type Price = {
    usd?: number;
    amount?: string;
    asset?: string;
    payTo?: string;
    url?: string;
};

export function requirementsOf(price: Price = {}): PaymentRequirements {
    return {
        scheme: "exact",
        network: NETWORK,
        asset: price.asset ?? USDC,
        amount: price.amount ?? String(Math.round((price.usd ?? 0.01) * 1_000_000)),
        payTo: price.payTo ?? PAYEE,
        maxTimeoutSeconds: 60,
        extra: {},
    };
}

// A v2 402 answer with one payment option
export function priceOf(price: Price = {}): PaymentRequired {
    return {
        x402Version: 2,
        resource: { url: price.url ?? "https://api.paid.dev/weather", description: "", mimeType: "application/json" },
        accepts: [requirementsOf(price)],
    };
}

// A v1 402 answer: the price is maxAmountRequired and the URL sits on the option
export function v1PriceOf(price: Price = {}) {
    const { amount, ...rest } = requirementsOf(price);
    return {
        x402Version: 1,
        accepts: [
            {
                ...rest,
                network: "base-sepolia",
                maxAmountRequired: amount,
                resource: price.url ?? "https://api.paid.dev/weather",
                description: "",
                mimeType: "application/json",
                outputSchema: {},
            },
        ],
    } as unknown as PaymentRequired;
}

// A local paid endpoint. A stub facilitator settles every signed payment.
export async function startPaidServer(price: Price = {}) {
    const settled: string[] = [];
    const server = createServer((request, response) => {
        const signature = request.headers["payment-signature"];
        if (typeof signature !== "string") {
            const url = `http://${request.headers.host}${request.url}`;
            response.writeHead(402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(priceOf({ url, ...price })) });
            response.end("{}");
            return;
        }
        const payment = decodePaymentSignatureHeader(signature);
        const transaction = `0x${String(settled.length + 1).padStart(64, "0")}`;
        settled.push(transaction);
        const header = encodePaymentResponseHeader({
            success: true,
            transaction,
            network: payment.accepted.network,
            payer: PAYEE,
        });
        response.writeHead(200, { "PAYMENT-RESPONSE": header, "content-type": "application/json" });
        response.end(JSON.stringify({ forecast: "sunny" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/weather`,
        settled,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

// Pays for a request the way the x402 fetch wrapper does
export function paidFetch(client: x402Client) {
    const http = new x402HTTPClient(client);
    return async (url: string): Promise<Response> => {
        const first = await fetch(url);
        if (first.status !== 402) {
            return first;
        }
        const required = http.getPaymentRequiredResponse((name) => first.headers.get(name));
        const payload = await client.createPaymentPayload(required);
        return fetch(url, { headers: http.encodePaymentSignatureHeader(payload) });
    };
}
