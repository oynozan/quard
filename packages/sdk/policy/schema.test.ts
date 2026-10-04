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

    it("keeps run limits and the delegate argument of a limit guard", () => {
        const policy = policySchema.parse({
            version: 1,
            runLimits: { mode: "block", depth: 2, costUsd: 0.5 },
            guards: { delegate: [{ type: "limit", delegateTo: "to" }] },
        });

        expect(policy.runLimits).toEqual({ mode: "block", depth: 2, costUsd: 0.5 });
        expect(policy.guards?.delegate).toEqual([{ type: "limit", delegateTo: "to" }]);
    });

    it("keeps the options of an x402 guard", () => {
        const x402 = {
            type: "x402",
            maxPerRun: 2,
            maxPaymentsPerRun: 10,
            blockHosts: ["*.evil.dev"],
            untrusted: "allow",
            assetCaps: { "0xabc": "1000000" },
            fleetCheck: false,
            approveAbove: 1,
        };

        expect(policySchema.parse({ version: 1, guards: { x402: [x402] } }).guards?.x402).toEqual([x402]);
    });

    it.each([
        ["no version", { guards: {} }],
        [
            "an x402 asset cap that is not atomic units",
            { version: 1, guards: { x402: [{ type: "x402", assetCaps: { a: "1.5" } }] } },
        ],
        ["a negative x402 cap", { version: 1, guards: { x402: [{ type: "x402", maxPerDay: -1 }] } }],
        ["an empty delegate argument", { version: 1, guards: { t: [{ type: "limit", delegateTo: "" }] } }],
        ["an unknown run limit", { version: 1, runLimits: { handoffs: 3 } }],
        ["a run limit that is not a whole number", { version: 1, runLimits: { steps: 2.5 } }],
        ["a negative cost limit", { version: 1, runLimits: { costUsd: -1 } }],
        ["an unknown run limit mode", { version: 1, runLimits: { mode: "warn" } }],
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

    it("accepts run limits with some fields left out", () => {
        expect(configureExtras.safeParse({ runLimits: { mode: "block", steps: 0, costUsd: 0.25 } }).success).toBe(true);
    });

    it.each([
        ["a detector with no label function", { detector: { name: "fake" } }],
        ["a detector with no name", { detector: { label: async () => ({}) } }],
        ["a detector that is not an object", { detector: "fake" }],
        ["a null detector", { detector: null }],
        ["an empty policy file path", { policyFile: "" }],
        ["a negative fan-out", { runLimits: { fanOut: -1 } }],
        ["a typo in the run limits", { runLimits: { maxSteps: 10 } }],
    ])("rejects %s", (_, value) => {
        expect(configureExtras.safeParse(value).success).toBe(false);
    });
});
