import { removeSecrets, urlHost, usdValue } from "@quard/shared";
import type { PaymentCreationContext } from "./client.ts";

const ATOMIC = /^\d{1,78}$/;

// The payment about to be signed, as the guard and the records see it
export type Payment = {
    x402Version: number;
    scheme: string;
    network: string;
    asset: string;
    // Atomic units; "0" when the server sent no valid amount
    amount: string;
    validAmount: boolean;
    // Null when the token's USD value is unknown
    usd: number | null;
    payTo: string;
    // The paid URL, with secrets removed
    resource: string;
    host: string;
};

// The paid URL: v2 keeps it on the 402 answer, v1 on each option
function resourceUrl(context: PaymentCreationContext): string {
    const resource = context.paymentRequired.resource as { url?: unknown } | string | undefined;
    const url = typeof resource === "object" && resource !== null ? resource.url : resource;
    const fallback = context.selectedRequirements.resource;
    return typeof url === "string" ? url : typeof fallback === "string" ? fallback : "";
}

// Removes keys, passwords and secret query values, as for any stored text
export function cleanResource(url: string): string {
    return removeSecrets(url).slice(0, 2000);
}

function hostOf(url: string): string {
    try {
        return urlHost(url).slice(0, 500);
    } catch {
        return "";
    }
}

// The host the guard checks a payment for, or "" when the 402 names none
export function paidHost(context: PaymentCreationContext): string {
    return hostOf(resourceUrl(context));
}

export function readPayment(context: PaymentCreationContext): Payment {
    const chosen = context.selectedRequirements;
    const raw = chosen.amount ?? chosen.maxAmountRequired;
    const validAmount = typeof raw === "string" && ATOMIC.test(raw);
    const amount = validAmount ? raw : "0";
    const url = resourceUrl(context);
    return {
        x402Version: context.paymentRequired.x402Version,
        scheme: chosen.scheme,
        network: chosen.network,
        asset: chosen.asset,
        amount,
        validAmount,
        usd: usdValue(chosen.asset, amount),
        payTo: chosen.payTo,
        resource: cleanResource(url),
        host: hostOf(url),
    };
}

// What the approver sees and what values are labeled in
export function paymentInput(payment: Payment): Record<string, unknown> {
    const { host, resource, payTo, amount, asset, usd, network, scheme } = payment;
    return { host, resource, payTo, amount, asset, usd, network, scheme };
}
