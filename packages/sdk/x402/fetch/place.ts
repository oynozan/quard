import { removeSecrets } from "@quard/shared";
import type { Place } from "../record/payments.ts";

type Input = string | URL | Request;

// By shape, not instanceof: servers such as @hono/node-server swap the
// global Request class, so a request can come from another one
function asRequest(input: Input): Request | undefined {
    return typeof input === "object" && !(input instanceof URL) && "headers" in input ? input : undefined;
}

export function urlOf(input: Input): string {
    return asRequest(input)?.url ?? String(input);
}

// The request's headers; init headers replace the Request's, as in fetch
export function headersOf(input: Input, init?: RequestInit): Headers {
    return new Headers(init?.headers ?? asRequest(input)?.headers);
}

// Where a payment goes: the host, and the URL with secrets removed
export function placeOf(url: string): Place {
    let host = "";
    try {
        host = new URL(url).hostname;
    } catch {
        // A relative URL has no host
    }
    return { key: url, host, resource: removeSecrets(url) };
}
