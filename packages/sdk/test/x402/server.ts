import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { decodeX402, paidOption, priceFrom, type PaymentRequired } from "@quard/shared";
import { stubFacilitator, v1Option, v2Options } from "./facilitator.ts";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function v2Price(url: string, error?: string): PaymentRequired {
    return { x402Version: 2, resource: { url, description: "Data" }, accepts: v2Options, ...(error ? { error } : {}) };
}

const v1Price = { x402Version: 1, error: "X-PAYMENT header is required", accepts: [v1Option] };

// A local x402 server. /v2/* prices in the PAYMENT-REQUIRED header,
// /v1/* in the body. /*/broken settles and then fails, /v2/silent sends
// no settlement, /free costs nothing.
export async function startX402Server() {
    const facilitator = stubFacilitator();
    const paid: string[] = [];
    const server = createServer((req, res) => {
        const path = req.url ?? "/";
        const v1 = path.startsWith("/v1/");
        const url = `http://${req.headers.host}${path}`;
        const header = req.headers[v1 ? "x-payment" : "payment-signature"];
        if (path === "/free") {
            res.writeHead(200, { "content-type": "application/json" }).end('{"free":true}');
            return;
        }
        if (typeof header !== "string") {
            askPrice(res, v1, url);
            return;
        }
        paid.push(path);
        const payment = decodeX402(header);
        const price = v1 ? priceFrom(v1Price) : v2Price(url);
        const option = paidOption(payment, price);
        const invalid = option === undefined ? "unknown_option" : facilitator.verify(payment);
        if (invalid !== undefined) {
            askPrice(res, v1, url, invalid);
            return;
        }
        const settlement = facilitator.settle((option as { network: string }).network);
        const responseHeader = v1 ? "x-payment-response" : "payment-response";
        if (!settlement.success) {
            res.writeHead(402, { [responseHeader]: encode(settlement) }).end("{}");
            return;
        }
        const failed = path.endsWith("/broken");
        const headers = path === "/v2/silent" ? {} : { [responseHeader]: encode(settlement) };
        res.writeHead(failed ? 500 : 200, { "content-type": "application/json", ...headers });
        res.end(failed ? '{"error":"upstream down"}' : '{"data":"paid content"}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        facilitator,
        paid,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

function askPrice(res: ServerResponse, v1: boolean, url: string, error?: string): void {
    if (v1) {
        const body = { ...v1Price, ...(error ? { error } : {}), accepts: [{ ...v1Option, resource: url }] };
        res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify(body));
        return;
    }
    res.writeHead(402, { "content-type": "application/json", "payment-required": encode(v2Price(url, error)) });
    res.end("{}");
}

export type X402Server = Awaited<ReturnType<typeof startX402Server>>;
