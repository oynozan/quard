// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signSession, verifySession, type Session } from "./session-token";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 9, 3, 12);
const session: Session = { sub: "did:privy:abc", email: "dana@acme.com", github: "dana", exp: NOW / 1000 + 3600 };

describe("session tokens", () => {
    it("round-trips a signed session", async () => {
        const token = await signSession(session, SECRET);
        expect(await verifySession(token, SECRET, NOW)).toEqual(session);
    });

    it("rejects another secret, a changed payload and a changed signature", async () => {
        const token = await signSession(session, SECRET);
        const [payload, signature] = token.split(".");
        expect(await verifySession(token, "x".repeat(40), NOW)).toBeNull();
        const forged = Buffer.from(JSON.stringify({ ...session, email: "eve@evil.com" })).toString("base64url");
        expect(await verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
        const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
        expect(await verifySession(`${payload}.${flipped}`, SECRET, NOW)).toBeNull();
    });

    it("rejects expired sessions", async () => {
        const token = await signSession(session, SECRET);
        expect(await verifySession(token, SECRET, session.exp * 1000)).toBeNull();
    });

    it("rejects malformed tokens", async () => {
        expect(await verifySession("", SECRET, NOW)).toBeNull();
        expect(await verifySession("abc", SECRET, NOW)).toBeNull();
        expect(await verifySession("a.b.c", SECRET, NOW)).toBeNull();
        expect(await verifySession("!!.abc", SECRET, NOW)).toBeNull();
        expect(await verifySession("abcde.abc", SECRET, NOW)).toBeNull();
    });

    it("rejects signed payloads with the wrong shape", async () => {
        const sign = async (body: string) => {
            const payload = Buffer.from(body).toString("base64url");
            const key = await crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(SECRET),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"],
            );
            const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
            return `${payload}.${Buffer.from(sig).toString("base64url")}`;
        };
        expect(await verifySession(await sign("not json"), SECRET, NOW)).toBeNull();
        expect(await verifySession(await sign(JSON.stringify({ sub: 1, exp: 9e9 })), SECRET, NOW)).toBeNull();
        const loose = await verifySession(await sign(JSON.stringify({ sub: "u", exp: 9e9, email: 5 })), SECRET, NOW);
        expect(loose).toEqual({ sub: "u", email: null, github: null, exp: 9e9 });
    });

    it("uses the current time by default", async () => {
        const token = await signSession({ ...session, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET);
        expect(await verifySession(token, SECRET)).not.toBeNull();
    });
});
