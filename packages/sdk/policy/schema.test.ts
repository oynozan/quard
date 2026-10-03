import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../test/files.ts";
import { configureExtras, parsePolicy, policySchema, signaturesConfig } from "./schema.ts";

describe("policy file schema", () => {
    it("accepts the example policy file", () => {
        const policy = parsePolicy(readFileSync(join(EXAMPLES, "policy", "quard.policy.json"), "utf8"));

        expect(Object.keys(policy.guards ?? {})).toEqual(["fetchPage", "sendEmail", "payInvoice", "deleteRecords"]);
    });

    it.each([
        ["no version", { guards: {} }],
        ["an unknown field", { version: 1, rules: [] }],
        ["an unknown guard type", { version: 1, guards: { t: [{ type: "fleet" }] } }],
        ["a typo in a guard option", { version: 1, guards: { t: [{ type: "limit", maxCalls: 3 }] } }],
        [
            "a negative amount cap",
            { version: 1, guards: { t: [{ type: "limit", maxAmountPerRun: { field: "a", max: -1 } }] } },
        ],
        ["an unknown payload action", { version: 1, guards: { t: [{ type: "egress", payload: { cards: "hide" } }] } }],
        ["a detector threshold above 1", { version: 1, detector: { flagAt: 2 } }],
    ])("rejects %s", (_, value) => {
        expect(policySchema.safeParse(value).success).toBe(false);
    });
});

describe("signatures config", () => {
    it.each([
        ["a file", { file: "feed.json" }, true],
        ["an https URL", { url: "https://feeds.example.com/s.json", refreshSeconds: 60 }, true],
        ["both a file and a URL", { file: "f.json", url: "https://feeds.example.com/s.json" }, false],
        ["neither a file nor a URL", { mode: "observe" }, false],
        ["a URL that is not http or https", { url: "ftp://feeds.example.com/s.json" }, false],
    ])("checks %s", (_, value, valid) => {
        expect(signaturesConfig.safeParse(value).success).toBe(valid);
    });
});

describe("configure options", () => {
    it("accepts a detector with a name and a label function", () => {
        const detector = { name: "fake", label: async () => ({ label: "none", probabilities: {} }) };

        expect(configureExtras.safeParse({ detector, detectorRules: { mode: "enforce" } }).success).toBe(true);
    });

    it.each([
        ["a detector with no label function", { detector: { name: "fake" } }],
        ["a detector with no name", { detector: { label: async () => ({}) } }],
        ["a detector that is not an object", { detector: "fake" }],
        ["a null detector", { detector: null }],
        ["an empty policy file path", { policyFile: "" }],
    ])("rejects %s", (_, value) => {
        expect(configureExtras.safeParse(value).success).toBe(false);
    });
});
