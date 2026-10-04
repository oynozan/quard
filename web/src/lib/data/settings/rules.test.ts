// @vitest-environment node
import type { ConnectedAppRow } from "@quard/db";
import { describe, expect, it } from "vitest";
import { entry } from "../../../../test/settings/connections";
import { rulesOf } from "./rules";

const A = "a".repeat(16);
const B = "b".repeat(16);

// An app whose connections run these rule sets
function app(name: string, rulesHashes: string[]): ConnectedAppRow {
    return {
        keyId: `key-${name}-${rulesHashes.join("-")}`,
        name,
        prefix: "qk_live_0a1b",
        sdk: "0.4.2",
        host: "web-1",
        rulesHash: A,
        disconnectedAt: null,
        rulesHashes,
    };
}

const team = { summary: "", source: "team" };

describe("rulesOf", () => {
    it("lists each rule once per guard and mode, with every tool it guards", () => {
        const set = {
            hash: A,
            rules: [
                entry("fetchPage", "source", "source", "observe"),
                entry("payInvoice", "action", "iban:from"),
                // A second action guard on the same tool with the same rule name
                entry("payInvoice", "action", "iban:from"),
                entry("payInvoice", "approval", "approval"),
                entry("readInbox", "source", "source"),
                entry("refund", "approval", "approval"),
            ],
        };

        expect(rulesOf([set], [app("billing", [A])])).toEqual([
            {
                ...team,
                name: "approval",
                guard: "approval",
                tools: ["payInvoice", "refund"],
                apps: ["billing"],
                mode: null,
                hash: A,
            },
            {
                ...team,
                name: "iban:from",
                guard: "action",
                tools: ["payInvoice"],
                apps: ["billing"],
                mode: "block",
                hash: A,
            },
            {
                ...team,
                name: "source",
                guard: "source",
                tools: ["readInbox"],
                apps: ["billing"],
                mode: "block",
                hash: A,
            },
            {
                ...team,
                name: "source",
                guard: "source",
                tools: ["fetchPage"],
                apps: ["billing"],
                mode: "observe",
                hash: A,
            },
        ]);
    });

    it("keeps each rule set apart and names the apps that run it once each", () => {
        const sets = [
            { hash: A, rules: [entry("payInvoice", "approval", "approval")] },
            { hash: B, rules: [entry("payInvoice", "approval", "approval")] },
        ];
        // Two keys can share a name once one of them is revoked
        const apps = [app("support", [A, B]), app("billing", [A]), app("billing", [A])];

        expect(rulesOf(sets, apps).map((row) => [row.hash, row.apps])).toEqual([
            [A, ["billing", "support"]],
            [B, ["support"]],
        ]);
    });

    it("lists run limits, which the SDK sends under the tool *, as the whole run", () => {
        const set = {
            hash: A,
            rules: [
                entry("*", "limit", "max-depth", "observe"),
                entry("delegate", "limit", "max-depth", "observe"),
                entry("*", "limit", "max-depth", "observe"),
                entry("*", "limit", "max-steps", "observe"),
            ],
        };

        expect(rulesOf([set], [app("billing", [A])]).map((row) => [row.name, row.tools])).toEqual([
            ["max-depth", ["delegate"]],
            ["max-steps", []],
        ]);
    });

    it("leaves out rules of a guard the dashboard does not know", () => {
        const set = {
            hash: A,
            rules: [entry("buyData", "x402", "max-spend"), entry("fetchPage", "egress", "allowlist")],
        };

        expect(rulesOf([set], [app("billing", [A])]).map((row) => row.name)).toEqual(["allowlist"]);
    });
});
