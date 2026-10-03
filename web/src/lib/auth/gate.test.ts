// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AuthEnv } from "./env";
import { sessionFromToken } from "./gate";
import { signSession } from "./session-token";

const env: AuthEnv = {
    appId: "app",
    appSecret: "secret",
    verificationKey: null,
    sessionSecret: "s".repeat(40),
    production: true,
};
const exp = Math.floor(Date.now() / 1000) + 3600;

describe("sessionFromToken", () => {
    it("accepts a signed session for an email or GitHub account", async () => {
        const token = await signSession({ sub: "u", email: "anyone@x.com", github: null, exp }, env.sessionSecret);
        expect(await sessionFromToken(token, env)).toMatchObject({ email: "anyone@x.com" });
    });

    it("refuses a signed session without an email or GitHub account", async () => {
        const token = await signSession({ sub: "u", email: null, github: null, exp }, env.sessionSecret);
        expect(await sessionFromToken(token, env)).toBeNull();
    });

    it("has no session without a token, settings or a valid signature", async () => {
        expect(await sessionFromToken(undefined, env)).toBeNull();
        expect(await sessionFromToken("x.y", null)).toBeNull();
        expect(await sessionFromToken("x.y", env)).toBeNull();
    });
});
