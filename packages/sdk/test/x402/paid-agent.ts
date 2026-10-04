import { wrapFetchWithPayment } from "@x402/fetch";
import type { X402Options } from "../../guards/options.ts";
import { guard, quard } from "../../index.ts";
import { testClient } from "./client.ts";

// An agent's tools for paid APIs: a web page reader, a trusted docs tool,
// and a fetch that pays with an x402 client the x402 guard checks
export function paidAgentTools(options: X402Options, page: string, docs: string) {
    const client = quard.x402(testClient(false), options);
    const paidFetch = wrapFetchWithPayment(quard.x402Fetch(fetch), client);
    return {
        readPage: guard(async (_input: { url: string }) => page, { type: "source", origin: "web", name: "readPage" }),
        readDocs: guard(async (_input: { api: string }) => docs, { type: "limit", name: "readDocs" }),
        fetchPaid: guard(
            async ({ url }: { url: string }) => {
                const response = await paidFetch(url);
                return `${response.status} ${await response.text()}`;
            },
            { type: "limit", name: "fetchPaid" },
        ),
    };
}
