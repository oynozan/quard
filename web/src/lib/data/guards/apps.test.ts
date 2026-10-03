// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, NOW } from "../rng";
import { appOf, rulesHashAt, SDK_APPS } from "./apps";

describe("appOf", () => {
    it("finds the app that runs an agent", () => {
        expect(appOf("billing").name).toBe("billing-service");
        expect(appOf("inbox-triage").name).toBe("support-app");
    });

    it("falls back to the first app for an agent no app reports", () => {
        expect(appOf("ghost")).toBe(SDK_APPS[0]);
    });
});

describe("rulesHashAt", () => {
    it("gives the hash before the last deploy for older decisions", () => {
        expect(rulesHashAt("billing", NOW - 4 * DAY)).toBe("c81e4f0a9b37");
    });

    it("gives the current hash from the deploy onward", () => {
        const app = appOf("billing");
        expect(rulesHashAt("billing", app.hashSince)).toBe("3f9a0c7d1e24");
        expect(rulesHashAt("billing", NOW)).toBe("3f9a0c7d1e24");
    });

    it("gives the current hash when the app never had another one", () => {
        expect(rulesHashAt("deploy-bot", NOW - 30 * DAY)).toBe("0c6f3b9e2a71");
    });
});
