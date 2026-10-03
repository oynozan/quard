// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "./session-token";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined) }),
}));
vi.mock("next/navigation", () => ({
    redirect: (to: string) => {
        throw new Error(`redirect:${to}`);
    },
}));

const { getSession, requireSession } = await import("./session");
const SECRET = "s".repeat(40);

describe("session reads", () => {
    beforeEach(() => {
        jar.clear();
        vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "cm0000000000000000000000a");
        vi.stubEnv("PRIVY_APP_SECRET", "secret");
        vi.stubEnv("QUARD_SESSION_SECRET", SECRET);
    });

    it("reads the signed-in person from the cookie", async () => {
        const exp = Math.floor(Date.now() / 1000) + 60;
        jar.set("quard_session", await signSession({ sub: "u", email: "dana@acme.com", github: null, exp }, SECRET));
        expect(await getSession()).toMatchObject({ email: "dana@acme.com" });
        expect(await requireSession()).toMatchObject({ sub: "u" });
    });

    it("reads the sample account when sign-in is skipped", async () => {
        vi.stubEnv("QUARD_SKIP_SIGN_IN", "1");
        expect(await getSession()).toMatchObject({ sub: "sample", email: "dana@acme.com" });
        vi.unstubAllEnvs();
    });

    it("sends people without a session to the sign-in page", async () => {
        expect(await getSession()).toBeNull();
        await expect(requireSession()).rejects.toThrow("redirect:/sign-in");
    });
});
