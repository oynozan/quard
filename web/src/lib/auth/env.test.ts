// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAuthEnv, setupProblems } from "./env";

const SECRET = "s".repeat(32);
const APP = "cm0000000000000000000000a";

describe("readAuthEnv", () => {
    it("is null until every setting is valid", () => {
        expect(readAuthEnv({})).toBeNull();
        expect(
            readAuthEnv({ NEXT_PUBLIC_PRIVY_APP_ID: APP, PRIVY_APP_SECRET: "x", QUARD_SESSION_SECRET: "short" }),
        ).toBeNull();
    });

    it("reads every setting", () => {
        const env = readAuthEnv({
            NEXT_PUBLIC_PRIVY_APP_ID: ` ${APP} `,
            PRIVY_APP_SECRET: "secret",
            PRIVY_VERIFICATION_KEY: "key",
            QUARD_SESSION_SECRET: SECRET,
            NODE_ENV: "production",
        });
        expect(env).toEqual({
            appId: APP,
            appSecret: "secret",
            verificationKey: "key",
            sessionSecret: SECRET,
            production: true,
        });
    });

    it("treats a blank verification key as none", () => {
        const env = readAuthEnv({
            NEXT_PUBLIC_PRIVY_APP_ID: APP,
            PRIVY_APP_SECRET: "secret",
            PRIVY_VERIFICATION_KEY: " ",
            QUARD_SESSION_SECRET: SECRET,
        });
        expect(env?.verificationKey).toBeNull();
        expect(env?.production).toBe(false);
    });

    it("reads the process environment by default", () => {
        const env = readAuthEnv();
        expect(env === null || typeof env.appId === "string").toBe(true);
    });
});

describe("setupProblems", () => {
    it("names each missing or malformed setting", () => {
        expect(setupProblems({})).toEqual([
            "NEXT_PUBLIC_PRIVY_APP_ID is not set",
            "PRIVY_APP_SECRET is not set",
            "QUARD_SESSION_SECRET is not set",
        ]);
        expect(
            setupProblems({ NEXT_PUBLIC_PRIVY_APP_ID: "short", PRIVY_APP_SECRET: "x", QUARD_SESSION_SECRET: "y" }),
        ).toEqual([
            "NEXT_PUBLIC_PRIVY_APP_ID must be 25 letters or digits",
            "QUARD_SESSION_SECRET must be at least 32 characters",
        ]);
        expect(
            setupProblems({ NEXT_PUBLIC_PRIVY_APP_ID: APP, PRIVY_APP_SECRET: "x", QUARD_SESSION_SECRET: SECRET }),
        ).toEqual([]);
        expect(Array.isArray(setupProblems())).toBe(true);
    });
});
