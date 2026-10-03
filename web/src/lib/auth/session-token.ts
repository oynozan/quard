// Signed session cookies: a base64url JSON payload and its HMAC-SHA256 signature.
// Web Crypto keeps this usable from the proxy and from route handlers alike.

export const SESSION_COOKIE = "quard_session";
export const SESSION_DAYS = 7;

export type Session = {
    // The Privy user id, for example "did:privy:…"
    sub: string;
    email: string | null;
    github: string | null;
    // Expiry in unix seconds
    exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    // Other spellings of the same bytes are refused, so each token has exactly one valid form.
    return toBase64Url(bytes) === text ? bytes : null;
}

function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
    ]);
}

export async function signSession(session: Session, secret: string): Promise<string> {
    const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
    const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

// The session, when the signature matches and it has not expired; otherwise null.
export async function verifySession(token: string, secret: string, now = Date.now()): Promise<Session | null> {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const raw = fromBase64Url(payload);
    const sig = fromBase64Url(signature);
    if (!raw || !sig) return null;
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(payload));
    if (!valid) return null;
    const session = parseSession(new TextDecoder().decode(raw));
    return session && session.exp * 1000 > now ? session : null;
}

function parseSession(json: string): Session | null {
    try {
        const value = JSON.parse(json) as Record<string, unknown>;
        if (typeof value.sub !== "string" || typeof value.exp !== "number") return null;
        return {
            sub: value.sub,
            email: typeof value.email === "string" ? value.email : null,
            github: typeof value.github === "string" ? value.github : null,
            exp: value.exp,
        };
    } catch {
        return null;
    }
}
