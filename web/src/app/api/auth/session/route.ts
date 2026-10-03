import { APIError } from "@privy-io/node";
import { NextResponse, type NextRequest } from "next/server";
import { canEnter } from "@/lib/auth/access";
import { readAuthEnv } from "@/lib/auth/env";
import { sameOrigin } from "@/lib/auth/origin";
import { verifyPrivyLogin } from "@/lib/auth/privy";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/session-token";

const DAY = 24 * 60 * 60;

function problem(status: number, error: string) {
    return NextResponse.json({ error }, { status });
}

async function readAccessToken(request: NextRequest): Promise<string | null> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return null;
    const token = (body as { accessToken?: unknown }).accessToken;
    return typeof token === "string" && token.length > 0 && token.length < 8192 ? token : null;
}

// Trades a verified Privy access token for a Quard session cookie.
export async function POST(request: NextRequest) {
    if (!sameOrigin(request.headers)) return problem(403, "Cross-site request");
    const env = readAuthEnv();
    if (!env) return problem(503, "Sign-in is not set up");
    const accessToken = await readAccessToken(request);
    if (!accessToken) return problem(400, "Missing access token");

    let login;
    try {
        login = await verifyPrivyLogin(accessToken, env);
    } catch (error) {
        console.error("[auth] Privy lookup failed:", error instanceof Error ? error.message : error);
        // Privy answers 401 or 403 when the app secret is wrong.
        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
            return problem(503, "Privy rejected the app secret");
        }
        return problem(502, "Privy could not be reached");
    }
    if (!login) return problem(401, "The sign-in could not be verified");
    if (!canEnter(login)) return problem(403, "Sign in with email or GitHub.");

    const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * DAY;
    const value = await signSession(
        { sub: login.sub, email: login.email, github: login.github, exp },
        env.sessionSecret,
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, value, {
        httpOnly: true,
        secure: env.production,
        sameSite: "lax",
        path: "/",
        expires: new Date(exp * 1000),
    });
    return response;
}

// Signs out by clearing the cookie.
export async function DELETE(request: NextRequest) {
    if (!sameOrigin(request.headers)) return problem(403, "Cross-site request");
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
    return response;
}
