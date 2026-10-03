import { vi } from "vitest";

// Fills each random byte with its index (00 01 02 … 0f), so a new key's secret is known
export function stubRandomBytes() {
    const fill = (array: Uint8Array) => {
        array.forEach((_, index) => (array[index] = index));
        return array;
    };
    return vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(fill as typeof crypto.getRandomValues);
}
