import { describe, expect, it } from "vitest";
import { checkX402Options, x402Rules, x402Settings } from "./settings.ts";

describe("x402Settings", () => {
    it("starts the product defaults in observe mode", () => {
        expect(x402Settings({ type: "x402" })).toEqual({
            maxPerPayment: { value: 1, mode: "observe" },
            maxPerRun: { value: 5, mode: "observe" },
            maxPerDay: { value: 50, mode: "observe" },
            maxPaymentsPerRun: undefined,
            allowHosts: undefined,
            blockHosts: undefined,
            untrusted: { value: true, mode: "observe" },
            assetCaps: undefined,
            fleetCheck: { value: true, mode: "observe" },
            approveAbove: undefined,
        });
    });

    it("runs options a team sets in the guard's mode, block by default", () => {
        const settings = x402Settings({ type: "x402", maxPerRun: 2, untrusted: "block", fleetCheck: true });

        expect(settings.maxPerRun).toEqual({ value: 2, mode: "block" });
        expect(settings.untrusted).toEqual({ value: true, mode: "block" });
        expect(settings.fleetCheck).toEqual({ value: true, mode: "block" });
        expect(x402Settings({ type: "x402", mode: "observe", maxPerRun: 2 }).maxPerRun.mode).toBe("observe");
    });

    it("turns the untrusted and fleet checks off", () => {
        const settings = x402Settings({ type: "x402", untrusted: "allow", fleetCheck: false });

        expect(settings.untrusted).toBeUndefined();
        expect(settings.fleetCheck).toBeUndefined();
    });
});

describe("x402Rules", () => {
    it("names the rules the guard runs", () => {
        const rules = x402Rules({ type: "x402", allowHosts: ["*.paid.dev"], approveAbove: 1, fleetCheck: false });

        expect(rules.map((entry) => entry.rule)).toEqual([
            "max-per-payment",
            "allow-hosts",
            "untrusted",
            "max-per-run",
            "max-per-day",
            "approve-above",
        ]);
        expect(rules[1]).toEqual({ rule: "allow-hosts", mode: "block" });
    });
});

describe("checkX402Options", () => {
    it("accepts sound options", () => {
        expect(() => checkX402Options({ type: "x402", maxPerDay: 0, assetCaps: { "0xabc": "1000000" } })).not.toThrow();
    });

    it.each([-1, Number.NaN, "5"])("refuses the amount %s", (value) => {
        expect(() => checkX402Options({ type: "x402", maxPerPayment: value as number })).toThrow("maxPerPayment");
    });

    it("refuses asset caps that are not atomic units", () => {
        expect(() => checkX402Options({ type: "x402", assetCaps: { "0xabc": "1.5" } })).toThrow("0xabc");
    });
});
