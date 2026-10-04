import { removeSecrets } from "@quard/shared";
import type { Place } from "../record/payments.ts";

type Input = string | URL | Request;

export function urlOf(input: Input): string {
    return input instanceof Request ? input.url : String(input);
}

// The request's headers; init headers replace the Request's, as in fetch
export function headersOf(input: Input, init?: RequestInit): Headers {
    return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
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
