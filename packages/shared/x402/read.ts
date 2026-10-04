import {
    paymentOption,
    paymentRequired,
    paymentResponse,
    X402_HEADERS,
    type PaymentOption,
    type PaymentRequired,
    type PaymentResponse,
} from "./schema.ts";

// Reads x402 prices, payments and settlements from headers and bodies.
// Each reader gives undefined for anything it can't read.

export type HeaderGetter = (name: string) => string | null | undefined;

// Base64 JSON, as x402 puts in its headers
export function decodeX402(value: string | null | undefined): unknown {
    if (value === null || value === undefined || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value.trim())) {
        return undefined;
    }
    try {
        return JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8"));
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// v1 named the amount maxAmountRequired
function v2Option(option: unknown): unknown {
    return isRecord(option) && option.amount === undefined && option.maxAmountRequired !== undefined
        ? { ...option, amount: option.maxAmountRequired }
        : option;
}

// A v1 or v2 price object, with v1 options moved to the v2 shape
export function priceFrom(value: unknown): PaymentRequired | undefined {
    if (!isRecord(value) || !Array.isArray(value.accepts)) {
        return undefined;
    }
    const parsed = paymentRequired.safeParse({ ...value, accepts: value.accepts.map(v2Option) });
    return parsed.success ? parsed.data : undefined;
}

// The price in a 402: the v2 header first, then a v1 body
export function readPrice(get: HeaderGetter, body?: unknown): PaymentRequired | undefined {
    return priceFrom(decodeX402(get(X402_HEADERS.required))) ?? priceFrom(body);
}

// The signed payment a request carries, as sent
export function readPayment(get: HeaderGetter): unknown {
    return decodeX402(get(X402_HEADERS.signature) ?? get(X402_HEADERS.v1Payment));
}

// Whether a request carries a payment header, readable or not
export function hasPayment(get: HeaderGetter): boolean {
    return [X402_HEADERS.signature, X402_HEADERS.v1Payment].some((name) => {
        const value = get(name);
        return value !== null && value !== undefined;
    });
}

export function settlementFrom(value: unknown): PaymentResponse | undefined {
    const parsed = paymentResponse.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

// The settlement a paid response carries
export function readSettlement(get: HeaderGetter): PaymentResponse | undefined {
    return settlementFrom(decodeX402(get(X402_HEADERS.response) ?? get(X402_HEADERS.v1Response)));
}

// The option a payment pays: v2 names it, v1 is found in the price by scheme and network
export function paidOption(payment: unknown, price?: PaymentRequired): PaymentOption | undefined {
    if (!isRecord(payment)) {
        return undefined;
    }
    if (payment.accepted !== undefined) {
        const parsed = paymentOption.safeParse(v2Option(payment.accepted));
        return parsed.success ? parsed.data : undefined;
    }
    return price?.accepts.find((option) => option.scheme === payment.scheme && option.network === payment.network);
}

// The x402 version a payment names, or the price's
export function x402VersionOf(payment: unknown, price?: PaymentRequired): number {
    const version = isRecord(payment) ? payment.x402Version : undefined;
    return typeof version === "number" && Number.isInteger(version) && version >= 1
        ? version
        : (price?.x402Version ?? 1);
}
