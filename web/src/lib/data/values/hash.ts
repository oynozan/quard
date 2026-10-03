// A stand-in for HMAC-SHA-256 with the install's 32-byte key.
// The same normalized value always gives the same hash, so search and tracing still match.

const INSTALL_KEY = "acme-prod:key-2026-08-12";

function fnv(text: string, seed: number): number {
    let hash = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
        hash ^= hash >>> 13;
    }
    return hash >>> 0;
}

// 32 hex characters. Show the first 12.
export function keyedHash(normalized: string): string {
    const text = `${INSTALL_KEY}|${normalized}`;
    return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
        .map((seed) => fnv(text, seed).toString(16).padStart(8, "0"))
        .join("");
}

// An approval is stored with a hash of its normalized arguments.
export function argsHash(agent: string, tool: string, args: { name: string; value: string }[]): string {
    const parts = [...args]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((arg) => `${arg.name}=${arg.value.trim().replace(/\s+/g, " ").toLowerCase()}`);
    return keyedHash(`${agent}|${tool}|${parts.join("&")}`);
}
