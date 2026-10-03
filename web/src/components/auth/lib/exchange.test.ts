// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { endSession, exchangeToken } from "./exchange";

const reply = (status: number, body?: unknown) =>
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe("exchangeToken", () => {
    it("posts the token and reports success", async () => {
        const fetcher = reply(200, { ok: true });
        expect(await exchangeToken("t", fetcher)).toEqual({ ok: true });
        expect(fetcher).toHaveBeenCalledWith(
            "/api/auth/session",
            expect.objectContaining({ method: "POST", body: '{"accessToken":"t"}' }),
        );
    });

    it("explains each failure in one sentence, without operator jargon", async () => {
        expect(await exchangeToken(null)).toEqual({ ok: false, message: "Sign-in did not finish. Try again." });
        expect(await exchangeToken("t", reply(403, { error: "Sign in with email or GitHub." }))).toEqual({
            ok: false,
            message: "Sign in with email or GitHub.",
        });
        expect(await exchangeToken("t", reply(403, { error: "Cross-site request" }))).toMatchObject({
            message: "That sign-in could not be verified. Try again.",
        });
        expect(await exchangeToken("t", reply(403))).toMatchObject({
            message: "That sign-in could not be verified. Try again.",
        });
        expect(await exchangeToken("t", reply(503))).toMatchObject({
            message: "Sign-in is not available right now. Try again in a minute.",
        });
        expect(await exchangeToken("t", reply(500))).toMatchObject({ message: "Sign-in failed. Try again." });
        const offline = vi.fn(async () => {
            throw new Error("offline");
        });
        expect(await exchangeToken("t", offline)).toMatchObject({
            message: "The server could not be reached. Try again.",
        });
    });
});

describe("endSession", () => {
    it("reports whether the server cleared the cookie", async () => {
        const fetcher = reply(204);
        expect(await endSession(fetcher)).toBe(true);
        expect(fetcher).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });
        expect(await endSession(reply(403))).toBe(false);
        expect(await endSession(vi.fn(async () => Promise.reject(new Error("x"))))).toBe(false);
    });
});
