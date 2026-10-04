import { canonicalJson } from "@quard/shared";

// Payments an x402 guard checked before they were signed, with the host
// it checked each for. x402Fetch sends a payment only to that host.

const MAX_KEPT = 10_000;
const checked = new Map<string, string>();

function keyOf(payload: unknown): string {
    return canonicalJson(payload);
}

export function markChecked(payload: unknown, host: string): void {
    const key = keyOf(payload);
    checked.delete(key);
    checked.set(key, host);
    if (checked.size > MAX_KEPT) {
        checked.delete(checked.keys().next().value as string);
    }
}

export function isChecked(payload: unknown): boolean {
    return checked.has(keyOf(payload));
}

// The host the guard checked the payment for, if it checked it
export function checkedHost(payload: unknown): string | undefined {
    return checked.get(keyOf(payload));
}

export function clearChecked(): void {
    checked.clear();
}
