// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "@/lib/auth/session-token";
import { config, proxy } from "./proxy";

const SECRET = "s".repeat(40);

async function cookieFor(email: string | null) {
    const exp = Math.floor(Date.now() / 1000) + 60;
    return `quard_session=${await signSession({ sub: "u", email, github: null, exp }, SECRET)}`;
}

function request(path: string, cookie?: string) {
    return new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} });
}

describe("proxy", () => {
    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "cm0000000000000000000000a");
        vi.stubEnv("PRIVY_APP_SECRET", "secret");
        vi.stubEnv("QUARD_SESSION_SECRET", SECRET);
    });

    it("sends visitors without a session to sign in, keeping where they were going", async () => {
        const response = await proxy(request("/runs?agent=billing"));
        expect(response.status).toBe(307);
        const target = new URL(response.headers.get("location")!);
        expect(target.pathname).toBe("/sign-in");
        expect(target.searchParams.get("next")).toBe("/runs?agent=billing");
        const home = new URL((await proxy(request("/"))).headers.get("location")!);
        expect(home.search).toBe("");
    });

    it("answers API calls without a session with 401", async () => {
        const response = await proxy(request("/api/anything"));
        expect(response.status).toBe(401);
    });

    it("lets signed-in people through", async () => {
        const response = await proxy(request("/runs", await cookieFor("dana@acme.com")));
        expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("treats sessions without an email or GitHub account, or forged ones, as none", async () => {
        expect((await proxy(request("/", await cookieFor(null)))).status).toBe(307);
        expect((await proxy(request("/", "quard_session=forged.value"))).status).toBe(307);
    });

    it("keeps the sign-in page and the session endpoint open", async () => {
        expect((await proxy(request("/sign-in"))).headers.get("x-middleware-next")).toBe("1");
        expect((await proxy(request("/api/auth/session"))).headers.get("x-middleware-next")).toBe("1");
    });

    it("moves signed-in people off the sign-in page, to a safe place only", async () => {
        const cookie = await cookieFor("dana@acme.com");
        const back = await proxy(request("/sign-in?next=/incidents", cookie));
        expect(new URL(back.headers.get("location")!).pathname).toBe("/incidents");
        const unsafe = await proxy(request("/sign-in?next=//evil.com", cookie));
        expect(new URL(unsafe.headers.get("location")!).href).toBe("http://localhost:3100/");
    });

    it("runs on everything except static build files and the icon", () => {
        const pattern = new RegExp(`^${config.matcher[0]}$`);
        expect(pattern.test("/runs")).toBe(true);
        expect(pattern.test("/api/auth/session")).toBe(true);
        expect(pattern.test("/_next/static/chunk.js")).toBe(false);
        expect(pattern.test("/_next/image")).toBe(false);
        expect(pattern.test("/_next/imagefoo")).toBe(true);
        expect(pattern.test("/icon.svg")).toBe(false);
        expect(pattern.test("/icon.svgx")).toBe(true);
        expect(pattern.test("/favicon.ico/runs")).toBe(true);
    });
});

describe("proxy with sign-in skipped", () => {
    beforeEach(() => vi.stubEnv("QUARD_SKIP_SIGN_IN", "1"));
    afterEach(() => vi.unstubAllEnvs());

    it("lets everyone in, and keeps the sign-in page visible", async () => {
        expect((await proxy(request("/runs"))).headers.get("x-middleware-next")).toBe("1");
        expect((await proxy(request("/sign-in"))).headers.get("x-middleware-next")).toBe("1");
    });

    it("ignores the switch in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        expect((await proxy(request("/runs"))).status).toBe(307);
    });
});
