// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canEnter, displayName, identityOf } from "./access";

describe("identityOf", () => {
    it("reads the verified email and the GitHub username", () => {
        const accounts = [
            { type: "wallet", address: "0xabc" },
            { type: "email", address: "Dana@Acme.com" },
            { type: "github_oauth", username: "dana-dev", email: "other@x.com" },
        ];
        expect(identityOf(accounts)).toEqual({ email: "dana@acme.com", github: "dana-dev" });
    });

    it("never treats a GitHub email as a verified email", () => {
        const githubOnly = [{ type: "github_oauth", username: null, email: "a@b.c" }];
        expect(identityOf(githubOnly)).toEqual({ email: null, github: null });
        expect(identityOf([])).toEqual({ email: null, github: null });
    });
});

describe("canEnter", () => {
    it("lets in anyone with a verified email or a GitHub account", () => {
        expect(canEnter({ email: "anyone@anywhere.com", github: null })).toBe(true);
        expect(canEnter({ email: null, github: "someone" })).toBe(true);
    });

    it("keeps out wallet, phone and other logins", () => {
        expect(canEnter({ email: null, github: null })).toBe(false);
    });
});

describe("displayName", () => {
    it("prefers the email, then the GitHub name", () => {
        expect(displayName({ email: "a@b.c", github: "x" })).toBe("a@b.c");
        expect(displayName({ email: null, github: "x" })).toBe("@x");
        expect(displayName({ email: null, github: null })).toBe("Signed in");
    });
});
