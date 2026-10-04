import { createHmac } from "node:crypto";

// A 32-byte key, written as 64 hex characters
export function parseHashKey(text: string): Buffer {
    const clean = text.trim();
    if (!/^[0-9a-f]{64}$/i.test(clean)) {
        throw new Error("The hash key must be 64 hex characters (32 bytes)");
    }
    return Buffer.from(clean, "hex");
}

// HMAC-SHA-256, cut to 32 hex characters. The kind is part of the
// input, so the same text as an IBAN and as an email never matches.
export function keyedHash(key: Buffer, kind: string, normalized: string): string {
    return createHmac("sha256", key).update(`${kind}:${normalized}`).digest("hex").slice(0, 32);
}

// The key one project hashes with, derived from the install's key. Projects never share
// hashes, and an agent only ever holds its own project's key, never the install's.
export function projectHashKey(installKey: Buffer, projectId: string): Buffer {
    return createHmac("sha256", installKey).update(`project:${projectId}`).digest();
}
