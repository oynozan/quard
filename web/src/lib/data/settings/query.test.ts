// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ORIGIN_OVERRIDES } from "../labels/origins";
import { DAY, NOW } from "../rng";
import { ACCOUNTS } from "../values/people";
import { agentKeys, RETENTION } from "./fixtures";
import { getSettings, rulesFromCode } from "./query";

const APPS = ["orchestrator-app", "billing-service", "support-app", "deploy-runner"];

describe("rulesFromCode", () => {
    it("lists each rule once, joining the tools and apps that share it", () => {
        const rules = rulesFromCode();
        const names = rules.map((rule) => rule.name);
        expect(new Set(names).size).toBe(names.length);
        expect(rules.find((rule) => rule.name === "fleet-check")).toEqual({
            name: "fleet-check",
            guard: "limit",
            tools: ["pay_invoice", "send_email"],
            apps: ["billing-service", "support-app"],
            mode: "block",
            hash: "71e2d9a05c3f",
            summary: "Blocks a new IBAN, recipient or domain once a 5th run uses it within 24 hours",
            source: "product default",
        });
    });

    it("keeps an approval rule's mode empty, since it always asks", () => {
        expect(rulesFromCode().find((rule) => rule.name === "refund_order")).toMatchObject({
            guard: "approval",
            mode: null,
            tools: ["refund_order"],
            apps: ["support-app"],
            source: "team",
        });
    });

    it("splits run limits into one rule per limit, for every app", () => {
        const rules = rulesFromCode();
        expect(rules.some((rule) => rule.name === "run-limits")).toBe(false);
        const limits = rules.filter((rule) => rule.name.startsWith("run-limits."));
        expect(limits.map((rule) => [rule.name, rule.tools, rule.summary, rule.mode, rule.source])).toEqual([
            ["run-limits.depth", ["delegate"], "3 levels per run", "observe", "product default"],
            ["run-limits.fan-out", ["delegate"], "10 helpers per agent per run", "observe", "product default"],
            ["run-limits.loops", ["delegate"], "5 handoffs back and forth per run", "block", "team"],
            ["run-limits.steps", [], "200 model calls per run", "observe", "product default"],
            ["run-limits.cost", [], "5 USD per run", "observe", "product default"],
        ]);
        expect(limits.every((rule) => rule.guard === "limit")).toBe(true);
        expect(limits.every((rule) => rule.apps.join() === APPS.join())).toBe(true);
    });
});

describe("getSettings", () => {
    it("gives the keys, accounts, retention, origins and rules", async () => {
        const settings = await getSettings();
        expect(settings.keys).toEqual(agentKeys());
        expect(settings.retention).toBe(RETENTION);
        expect(settings.origins).toBe(ORIGIN_OVERRIDES);
        expect(settings.rules).toEqual(rulesFromCode());
        expect(settings.accounts).toBe(ACCOUNTS);
    });

    it("shows each connected SDK with its key prefix instead of the key id", async () => {
        const { sdks } = await getSettings();
        expect(sdks.map((sdk) => [sdk.name, sdk.key, sdk.state])).toEqual([
            ["orchestrator-app", "qk_live_2c8e…", "connected"],
            ["billing-service", "qk_live_7f31…", "connected"],
            ["support-app", "qk_live_a40d…", "connected"],
            ["deploy-runner", "qk_live_91be…", "offline"],
        ]);
        expect(sdks.some((sdk) => "keyId" in sdk)).toBe(false);
    });

    it("gives the hash key and the detector in observe mode", async () => {
        const settings = await getSettings();
        expect(settings.hashKey).toEqual({ algorithm: "HMAC-SHA-256", setAt: NOW - 52 * DAY, previousKeptUntil: null });
        expect(settings.detector).toEqual({ name: "Jev", version: "jev-1.13.0", mode: "observe" });
    });
});
