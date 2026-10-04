import type { Mode } from "../call.ts";
import type { X402Options } from "../options.ts";

// One option of an x402 guard and the mode its rule runs in
export type Setting<T> = { value: T; mode: Mode };

export type X402Settings = {
    maxPerPayment: Setting<number>;
    maxPerRun: Setting<number>;
    maxPerDay: Setting<number>;
    maxPaymentsPerRun?: Setting<number>;
    allowHosts?: Setting<string[]>;
    blockHosts?: Setting<string[]>;
    untrusted?: Setting<true>;
    assetCaps?: Setting<Record<string, string>>;
    fleetCheck?: Setting<true>;
    approveAbove?: Setting<number>;
};

// Claude's pick in PROJECT.md: $1 per payment, $5 per run, $50 per day
export const X402_DEFAULTS = { maxPerPayment: 1, maxPerRun: 5, maxPerDay: 50 } as const;

// Each option with the rule name its decisions use, in check order
const RULES: ReadonlyArray<readonly [keyof X402Settings, string]> = [
    ["maxPerPayment", "max-per-payment"],
    ["assetCaps", "asset-caps"],
    ["blockHosts", "block-hosts"],
    ["allowHosts", "allow-hosts"],
    ["untrusted", "untrusted"],
    ["maxPaymentsPerRun", "max-payments-per-run"],
    ["maxPerRun", "max-per-run"],
    ["maxPerDay", "max-per-day"],
    ["fleetCheck", "fleet-check"],
    ["approveAbove", "approve-above"],
];

// Options a team sets follow the guard's mode. Product defaults start in
// observe mode, like the other product defaults.
function setting<T>(value: T | undefined, fallback: T | undefined, mode: Mode): Setting<T> | undefined {
    if (value !== undefined) {
        return { value, mode };
    }
    return fallback === undefined ? undefined : { value: fallback, mode: "observe" };
}

// An on or off option, on by default
function onByDefault(on: boolean | undefined, mode: Mode): Setting<true> | undefined {
    return on === false ? undefined : setting<true>(on === true ? true : undefined, true, mode);
}

export function x402Settings(options: X402Options): X402Settings {
    const mode = options.mode ?? "block";
    return {
        maxPerPayment: setting(options.maxPerPayment, X402_DEFAULTS.maxPerPayment, mode) as Setting<number>,
        maxPerRun: setting(options.maxPerRun, X402_DEFAULTS.maxPerRun, mode) as Setting<number>,
        maxPerDay: setting(options.maxPerDay, X402_DEFAULTS.maxPerDay, mode) as Setting<number>,
        maxPaymentsPerRun: setting(options.maxPaymentsPerRun, undefined, mode),
        allowHosts: setting(options.allowHosts, undefined, mode),
        blockHosts: setting(options.blockHosts, undefined, mode),
        untrusted: onByDefault(options.untrusted === undefined ? undefined : options.untrusted === "block", mode),
        assetCaps: setting(options.assetCaps, undefined, mode),
        fleetCheck: onByDefault(options.fleetCheck, mode),
        approveAbove: setting(options.approveAbove, undefined, mode),
    };
}

// The rules an x402 guard runs, with each one's mode
export function x402Rules(options: X402Options): Array<{ rule: string; mode: Mode }> {
    const settings = x402Settings(options);
    return RULES.flatMap(([key, rule]) => {
        const found = settings[key];
        return found === undefined ? [] : [{ rule, mode: found.mode }];
    });
}

const ATOMIC = /^\d{1,78}$/;

// Throws for options no payment could be checked against
export function checkX402Options(options: X402Options): void {
    for (const key of ["maxPerPayment", "maxPerRun", "maxPerDay", "maxPaymentsPerRun", "approveAbove"] as const) {
        const value = options[key];
        if (value !== undefined && !(typeof value === "number" && value >= 0)) {
            throw new Error(`x402 guard: ${key} must be a number of 0 or more`);
        }
    }
    for (const [asset, cap] of Object.entries(options.assetCaps ?? {})) {
        if (!ATOMIC.test(cap)) {
            throw new Error(`x402 guard: the assetCaps entry for ${asset} must be atomic units, such as "1000000"`);
        }
    }
}
