// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canEnter, displayName } from "./access";
import { LOCAL_SESSION, skipsSignIn } from "./skip";

describe("skipsSignIn", () => {
    it("skips sign-in only when the switch is 1 outside production", () => {
        expect(skipsSignIn({ QUARD_SKIP_SIGN_IN: "1", NODE_ENV: "development" })).toBe(true);
        expect(skipsSignIn({ QUARD_SKIP_SIGN_IN: "1", NODE_ENV: "production" })).toBe(false);
        expect(skipsSignIn({ QUARD_SKIP_SIGN_IN: "true", NODE_ENV: "development" })).toBe(false);
        expect(skipsSignIn({ NODE_ENV: "development" })).toBe(false);
    });

    it("reads the real environment by default", () => {
        expect(skipsSignIn()).toBe(false);
    });
});

describe("LOCAL_SESSION", () => {
    it("is a neutral local account that may enter and never expires", () => {
        expect(LOCAL_SESSION).toMatchObject({ sub: "local", email: "dev@localhost", github: null });
        expect(displayName(LOCAL_SESSION)).toBe("dev@localhost");
        expect(canEnter(LOCAL_SESSION)).toBe(true);
        expect(LOCAL_SESSION.exp * 1000).toBeGreaterThan(Date.now());
    });
});
