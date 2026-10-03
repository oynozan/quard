// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canEnter } from "./access";
import { SAMPLE_SESSION, skipsSignIn } from "./skip";

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

describe("SAMPLE_SESSION", () => {
    it("is the sample data's account, and may enter", () => {
        expect(SAMPLE_SESSION.email).toBe("dana@acme.com");
        expect(canEnter(SAMPLE_SESSION)).toBe(true);
        expect(SAMPLE_SESSION.exp * 1000).toBeGreaterThan(Date.now());
    });
});
