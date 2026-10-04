import { canonicalJson } from "@quard/shared";

// Payments an x402 guard checked before they were signed. x402Fetch sends
// a signed payment only when it is here.

const MAX_KEPT = 10_000;
const checked = new Set<string>();

function keyOf(payload: unknown): string {
    return canonicalJson(payload);
}

export function markChecked(payload: unknown): void {
    const key = keyOf(payload);
    checked.delete(key);
    checked.add(key);
    if (checked.size > MAX_KEPT) {
        checked.delete(checked.values().next().value as string);
    }
}

export function isChecked(payload: unknown): boolean {
    return checked.has(keyOf(payload));
}

export function clearChecked(): void {
    checked.clear();
}
