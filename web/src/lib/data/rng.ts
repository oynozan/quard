// Seeded random numbers, so mock data is the same on the server and the client.

export type Rng = () => number;

export function createRng(seed: number): Rng {
    let state = seed;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomInt(rng: Rng, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
    return items[Math.floor(rng() * items.length)];
}

export function randomHex(rng: Rng, length: number): string {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += Math.floor(rng() * 16).toString(16);
    }
    return out;
}

// The moment the mock data treats as "now": 3 Oct 2026, 18:40 UTC.
export const NOW = Date.UTC(2026, 9, 3, 18, 40);

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const SECOND = 1000;

// A 32-bit seed from any text, such as a run id (FNV-1a).
export function seedFrom(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function chance(rng: Rng, probability: number): boolean {
    return rng() < probability;
}

export function between(rng: Rng, min: number, max: number): number {
    return min + rng() * (max - min);
}

// Run ids use the W3C trace format: 32 lowercase hex characters.
export function isRunId(id: string): boolean {
    return /^[0-9a-f]{32}$/.test(id);
}
