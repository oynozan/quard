import { describe, expect, it } from "vitest";
import { findSecrets } from "./secrets.ts";

// Fixtures are joined at run time, so the source holds no key-shaped text
const join = (...parts: string[]) => parts.join("");
const KEYS: ReadonlyArray<readonly [string, string]> = [
    ["sk-api-key", join("sk-", "proj-", "a1B2c3D4e5F6g7H8i9J0kLmN")],
    ["aws-access-key", join("AKIA", "IOSFODNN7EXAMPLE")],
    ["github-token", join("ghp_", "a".repeat(36))],
    ["slack-token", join("xoxb-", "1234567890-abcdef")],
    ["google-api-key", join("AIza", "b".repeat(35))],
    ["stripe-key", join("sk_", "live_", "c".repeat(24))],
    ["private-key", join("-----BEGIN RSA ", "PRIVATE KEY-----\nMIIabc\n-----END RSA ", "PRIVATE KEY-----")],
    ["jwt", join("eyJhbGciOiJI", ".eyJzdWIiOiIx", ".dozjgNryP4J3jVmN")],
];

describe("findSecrets", () => {
    it.each(KEYS)("finds a %s", (name, secret) => {
        const found = findSecrets(`config: ${secret} end`);

        expect(found.map((span) => span.name)).toEqual([name]);
        expect(found[0]?.value).toBe(secret);
    });

    it.each([
        ["a word starting with sk-", "sk-learn is a library"],
        ["a short AKIA string", "AKIA1234"],
        ["a public key block", "-----BEGIN PUBLIC KEY-----"],
        ["two-part base64", "eyJhbGciOiJI.eyJzdWIiOiIx"],
    ])("skips %s", (_, text) => {
        expect(findSecrets(text)).toEqual([]);
    });

    it("covers the whole private key block, not just the header", () => {
        const block = join("-----BEGIN ", "PRIVATE KEY-----\nAAAA\nBBBB\n-----END ", "PRIVATE KEY-----");

        expect(findSecrets(`x ${block} y`)[0]?.value).toBe(block);
    });
});
