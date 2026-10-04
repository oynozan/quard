import { describe, expect, it } from "vitest";
import { findSecrets, removeSecrets, SECRET_FIELD } from "./secrets.ts";

// Fixtures are joined at run time, so the source holds no key-shaped text
const join = (...parts: string[]) => parts.join("");
const KEYS: ReadonlyArray<readonly [string, string]> = [
    ["quard-agent-key", join("qk_", "live_", "d".repeat(24))],
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

// Built from parts, so no real-looking key sits in the source
const tail = (length: number) => "a1B2c3D4e5".repeat(5).slice(0, length);

describe("removeSecrets", () => {
    it.each([
        ["a Quard agent key", `qk_live_${tail(24).toLowerCase()}`, "qk_live_…"],
        ["an Anthropic key", `sk-ant-api03-${tail(30)}`, "sk-ant-…"],
        ["an OpenAI project key", `sk-proj-${tail(30)}`, "sk-proj-…"],
        ["an OpenAI key", `sk-${tail(30)}`, "sk-…"],
        ["a Stripe key", `${"sk"}_${"live"}_${tail(24)}`, "sk_live_…"],
        ["a GitHub token", `ghp_${tail(36)}`, "ghp_…"],
        ["a GitHub fine-grained token", `github_pat_${tail(50)}`, "github_pat_…"],
        ["a Slack token", `xoxb-${tail(20)}`, "xoxb-…"],
        ["an AWS key id", `${"AKIA"}${"IOSFODNN7EXAMPLE"}`, "AKIA…"],
        ["a Google API key", `AIza${tail(35)}`, "AIza…"],
        ["a JWT", `eyJ${tail(12)}.eyJ${tail(12)}.${tail(12)}`, "eyJ…"],
    ])("removes %s and keeps its prefix", (_, secret, expected) => {
        expect(removeSecrets(`key: ${secret} end`)).toBe(`key: ${expected} end`);
    });

    it("removes a private key block", () => {
        const block = `-----BEGIN RSA PRIVATE KEY-----\n${tail(40)}\n-----END RSA PRIVATE KEY-----`;
        expect(removeSecrets(`a ${block} b`)).toBe("a [private key] b");
    });

    it("removes a key inside a private key block with the block", () => {
        const block = `-----BEGIN PRIVATE KEY-----\n${"AKIA"}${"IOSFODNN7EXAMPLE"}\n-----END PRIVATE KEY-----`;
        expect(removeSecrets(block)).toBe("[private key]");
    });

    it("removes a bearer token", () => {
        expect(removeSecrets(`Authorization: Bearer ${tail(30)}==`)).toBe("Authorization: Bearer …");
    });

    it.each([
        ["password=hunter2000", "password=…"],
        ['{"api_key":"abc123def"}', '{"api_key":"…"}'],
        ["token: abcdef123", "token: …"],
        ["https://x.io/cb?access_token=abcdef123&id=4", "https://x.io/cb?access_token=…&id=4"],
        ["refresh_token=1//0gAbcDef", "refresh_token=…"],
        ['{"client_secret": "s3cr3t-value"}', '{"client_secret": "…"}'],
        ["X-Api-Key: abcdef123456", "X-Api-Key: …"],
        ["id_token=abcdef123", "id_token=…"],
    ])("removes the value in %s", (text, expected) => {
        expect(removeSecrets(text)).toBe(expected);
    });

    it.each([
        ["Cookie: session=8f14e45f; theme=dark\nAccept: */*", "Cookie: …\nAccept: */*"],
        ['{"authorization": "Basic dXNlcjpzZWNyZXQ="}', '{"authorization": "…"}'],
        ["Set-Cookie: sid=abc123def; HttpOnly", "Set-Cookie: …"],
    ])("removes the whole header value in %s", (text, expected) => {
        expect(removeSecrets(text)).toBe(expected);
    });

    it("stays fast on long hyphenated text", () => {
        const text = "a-".repeat(50_000);
        expect(removeSecrets(text)).toBe(text);
    });

    it("leaves plain text alone", () => {
        expect(removeSecrets("Pay invoice 114 by Friday, tokens used: 52")).toBe(
            "Pay invoice 114 by Friday, tokens used: 52",
        );
    });
});

describe("SECRET_FIELD", () => {
    it("matches secret field names only", () => {
        const secret = [
            "password",
            "API_KEY",
            "client-secret",
            "Authorization",
            "sessionToken",
            "x-api-key",
            "id_token",
        ];
        expect(secret.every((name) => SECRET_FIELD.test(name))).toBe(true);
        const plain = ["tokens", "input_tokens", "name", "secretary", "keyboard"];
        expect(plain.some((name) => SECRET_FIELD.test(name))).toBe(false);
    });
});
