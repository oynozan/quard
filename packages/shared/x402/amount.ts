// Atomic units hold at most 78 digits, the size of a uint256
const MAX_DIGITS = 78;
// Longer text is never a valid amount, so BigInt doesn't read it
const MAX_LENGTH = 200;

function bigIntOf(value: unknown): bigint | undefined {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) ? BigInt(value) : undefined;
    }
    if (typeof value !== "string" || value.trim() === "" || value.length > MAX_LENGTH) {
        return undefined;
    }
    try {
        return BigInt(value);
    } catch {
        return undefined;
    }
}

// An amount as a decimal string of atomic units. A signer reads any whole
// number BigInt can, such as 1000000 or "0xF4240", so the same are read here.
export function atomicAmount(value: unknown): string | undefined {
    const amount = bigIntOf(value);
    const text = amount?.toString();
    return amount === undefined || amount < 0n || (text as string).length > MAX_DIGITS ? undefined : text;
}
