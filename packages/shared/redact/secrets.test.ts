import { describe, expect, it } from "vitest";
import { removeSecrets, SECRET_FIELD } from "./secrets.ts";

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
        ["a GitHub fine-grained token", `github_pat_${tail(30)}`, "github_pat_…"],
        ["a Slack token", `xoxb-${tail(20)}`, "xoxb-…"],
        ["an AWS key id", `${"AKIA"}${"IOSFODNN7EXAMPLE"}`, "AKIA…"],
        ["a Google API key", `AIza${tail(35)}`, "AIza…"],
        ["a JWT", `eyJ${tail(12)}.${tail(12)}.${tail(12)}`, "eyJ…"],
    ])("removes %s and keeps its prefix", (_, secret, expected) => {
        expect(removeSecrets(`key: ${secret} end`)).toBe(`key: ${expected} end`);
    });

    it("removes a private key block", () => {
        const block = `-----BEGIN RSA PRIVATE KEY-----\n${tail(40)}\n-----END RSA PRIVATE KEY-----`;
        expect(removeSecrets(`a ${block} b`)).toBe("a [private key] b");
    });

    it("removes a bearer token", () => {
        expect(removeSecrets(`Authorization: Bearer ${tail(30)}==`)).toBe("Authorization: Bearer …");
    });

    it.each([
        ["password=hunter2000", "password=…"],
        ['{"api_key":"abc123def"}', '{"api_key":"…"}'],
        ["token: abcdef123", "token: …"],
        ["https://x.io/cb?access_token=abcdef123&id=4", "https://x.io/cb?access_token=…&id=4"],
    ])("removes the value in %s", (text, expected) => {
        expect(removeSecrets(text)).toBe(expected);
    });

    it("leaves plain text alone", () => {
        expect(removeSecrets("Pay invoice 114 by Friday, tokens used: 52")).toBe(
            "Pay invoice 114 by Friday, tokens used: 52",
        );
    });
});

describe("SECRET_FIELD", () => {
    it("matches secret field names only", () => {
        expect(["password", "API_KEY", "client-secret", "Authorization"].every((name) => SECRET_FIELD.test(name))).toBe(
            true,
        );
        expect(["tokens", "input_tokens", "name"].some((name) => SECRET_FIELD.test(name))).toBe(false);
    });
});
