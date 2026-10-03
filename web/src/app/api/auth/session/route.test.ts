// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifySession } from "@/lib/auth/session-token";

const verifyPrivyLogin = vi.fn();
vi.mock("@/lib/auth/privy", () => ({ verifyPrivyLogin: (...args: unknown[]) => verifyPrivyLogin(...args) }));
vi.mock("@privy-io/node", () => ({
    APIError: class APIError extends Error {
        constructor(readonly status: number) {
            super(`status ${status}`);
        }
    },
}));

const { APIError } = (await import("@privy-io/node")) as unknown as { APIError: new (status: number) => Error };
const { DELETE, POST } = await import("./route");
const SECRET = "s".repeat(40);
const ENDPOINT = "http://localhost:3100/api/auth/session";
const SAME = { origin: "http://localhost:3100", host: "localhost:3100" };

function post(body: unknown, headers: Record<string, string> = SAME) {
    return new NextRequest(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

describe("POST /api/auth/session", () => {
    beforeEach(() => {
        verifyPrivyLogin.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "cm0000000000000000000000a");
        vi.stubEnv("PRIVY_APP_SECRET", "secret");
        vi.stubEnv("QUARD_SESSION_SECRET", SECRET);
        vi.stubEnv("NODE_ENV", "production");
    });

    it("signs in anyone with an email or GitHub account, with a signed HTTP-only cookie", async () => {
        verifyPrivyLogin.mockResolvedValue({ sub: "did:privy:1", email: null, github: "anyone" });
        const response = await POST(post({ accessToken: "t" }));
        expect(response.status).toBe(200);
        const cookie = response.cookies.get("quard_session");
        expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
        expect(await verifySession(cookie!.value, SECRET)).toMatchObject({ sub: "did:privy:1", github: "anyone" });
        expect(verifyPrivyLogin).toHaveBeenCalledWith(
            "t",
            expect.objectContaining({ appId: "cm0000000000000000000000a" }),
        );
    });

    it("refuses wallet and other logins without an email or GitHub account", async () => {
        verifyPrivyLogin.mockResolvedValue({ sub: "did:privy:2", email: null, github: null });
        const response = await POST(post({ accessToken: "t" }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Sign in with email or GitHub." });
        expect(response.cookies.get("quard_session")).toBeUndefined();
    });

    it("refuses tokens Privy rejects, and tells setup problems from outages", async () => {
        verifyPrivyLogin.mockResolvedValue(null);
        expect((await POST(post({ accessToken: "t" }))).status).toBe(401);
        verifyPrivyLogin.mockRejectedValue(new APIError(401));
        expect((await POST(post({ accessToken: "t" }))).status).toBe(503);
        verifyPrivyLogin.mockRejectedValue(new APIError(403));
        expect((await POST(post({ accessToken: "t" }))).status).toBe(503);
        verifyPrivyLogin.mockRejectedValue(new APIError(500));
        expect((await POST(post({ accessToken: "t" }))).status).toBe(502);
        verifyPrivyLogin.mockRejectedValue("down");
        expect((await POST(post({ accessToken: "t" }))).status).toBe(502);
    });

    it("needs a token in a JSON body", async () => {
        expect((await POST(post({}))).status).toBe(400);
        expect((await POST(post("not json"))).status).toBe(400);
        expect((await POST(post({ accessToken: "x".repeat(9000) }))).status).toBe(400);
        expect((await POST(post("null"))).status).toBe(400);
        expect(verifyPrivyLogin).not.toHaveBeenCalled();
    });

    it("refuses requests from other sites", async () => {
        const response = await POST(post({ accessToken: "t" }, { origin: "https://evil.com", host: "localhost:3100" }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Cross-site request" });
        expect(verifyPrivyLogin).not.toHaveBeenCalled();
    });

    it("trusts the first forwarded host behind proxies", async () => {
        verifyPrivyLogin.mockResolvedValue(null);
        const forwarded = {
            origin: "https://quard.acme.com",
            host: "internal:3000",
            "x-forwarded-host": "quard.acme.com, edge.internal",
        };
        expect((await POST(post({ accessToken: "t" }, forwarded))).status).toBe(401);
    });

    it("stays closed until sign-in is set up", async () => {
        vi.stubEnv("QUARD_SESSION_SECRET", "");
        expect((await POST(post({ accessToken: "t" }))).status).toBe(503);
    });
});

describe("DELETE /api/auth/session", () => {
    it("clears the cookie", async () => {
        const response = await DELETE(new NextRequest(ENDPOINT, { method: "DELETE", headers: SAME }));
        expect(response.status).toBe(204);
        expect(response.cookies.get("quard_session")).toMatchObject({ value: "", maxAge: 0 });
    });

    it("refuses sign-outs from other sites", async () => {
        const request = new NextRequest(ENDPOINT, {
            method: "DELETE",
            headers: { origin: "https://evil.com", host: "localhost:3100" },
        });
        expect((await DELETE(request)).status).toBe(403);
    });
});
