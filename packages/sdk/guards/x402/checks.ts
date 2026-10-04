import { fleetValue, hostMatches, type FleetValue, type ReasonCode } from "@quard/shared";
import type { Match } from "../../labels/content-index.ts";
import { firstAppearance, labelArguments } from "../../labels/value-labels.ts";
import { activeControl } from "../../transport/link/active.ts";
import type { GuardCall, RuleResult } from "../call.ts";
import { dayUsed, utcDay } from "../limit/daily.ts";
import { fleetMatch } from "../limit/fleet.ts";
import { amountKey, callsKey, runUsed } from "../limit/run-counts.ts";
import type { Payment } from "./payment.ts";
import type { Setting, X402Settings } from "./settings.ts";

// Control's per-day counter for the USD a guard's payments add
export const DAY_COUNTER = "amount:usd";

export function paymentsKey(name: string): string {
    return callsKey(name);
}

export function usdKey(name: string): string {
    return amountKey(name, "usd");
}

// A payee as a fleet value. EVM addresses are not case-sensitive.
export function payeeValue(payTo: string): FleetValue | undefined {
    const address = /^0x[0-9a-fA-F]{40}$/.test(payTo) ? payTo.toLowerCase() : payTo;
    const parsed = fleetValue.safeParse({ field: "payTo", kind: "wallet", key: `wallet:${address}` });
    return parsed.success ? parsed.data : undefined;
}

type Outcome = ReasonCode | undefined;

function result(
    rule: string,
    found: Setting<unknown>,
    failed: Outcome,
    decision: "block" | "ask" = "block",
): RuleResult {
    return failed === undefined
        ? { guard: "x402", rule, decision: "allow", mode: found.mode }
        : { guard: "x402", rule, decision, mode: found.mode, reason: failed };
}

function assetCap(caps: Record<string, string>, asset: string): string | undefined {
    const key = Object.keys(caps).find((entry) => entry === asset || entry.toLowerCase() === asset.toLowerCase());
    return key === undefined ? undefined : caps[key];
}

// True when the text's values first appeared in untrusted content
function fromUntrusted(call: GuardCall, text: string, types: readonly string[], matches: Match[]): boolean {
    return labelArguments(text, call.run.index)
        .flatMap((label) => label.values)
        .filter((value) => types.length === 0 || types.includes(value.type))
        .some((value) => firstAppearance(value, matches)?.trust === "untrusted");
}

// A main-domain match alone is ignored for an allowed host, as for egress
function untrustedPayee(call: GuardCall, payment: Payment, settings: X402Settings): boolean {
    const allowed = settings.allowHosts?.value.some((pattern) => hostMatches(payment.host, pattern)) === true;
    const matches: Match[] = allowed ? ["exact", "host"] : ["exact", "host", "domain"];
    return (
        fromUntrusted(call, payment.resource, ["url", "host"], matches) ||
        fromUntrusted(call, payment.payTo, [], ["exact"])
    );
}

function fleetResult(call: GuardCall, payment: Payment, found: Setting<true>): RuleResult {
    const fleet = activeControl()?.fleet;
    const value = payeeValue(payment.payTo);
    const now = Date.now();
    const match =
        fleet === undefined || value === undefined
            ? undefined
            : fleetMatch([value], found.mode, fleet.pastObserve(now), (key) => fleet.entry(key, now));
    return match === undefined
        ? result("fleet-check", found, undefined)
        : { guard: "x402", rule: "fleet-check", decision: "block", mode: match.mode, reason: "x402_payee_quarantined" };
}

// Every rule of the guard on one payment, with the run and day totals
// this process knows. Counting through control comes later.
export function checkPayment(
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    withApproval: boolean,
): RuleResult[] {
    const { usd, host } = payment;
    const results: RuleResult[] = [];
    const over = (total: number, max: number) => total > max;
    const { maxPerPayment, assetCaps, blockHosts, allowHosts, untrusted, maxPaymentsPerRun } = settings;

    // A broken amount can't be checked, so it counts as over
    const tooMuch = !payment.validAmount || (usd !== null && over(usd, maxPerPayment.value));
    results.push(result("max-per-payment", maxPerPayment, tooMuch ? "x402_over_payment_limit" : undefined));
    if (assetCaps !== undefined) {
        const cap = usd === null ? assetCap(assetCaps.value, payment.asset) : undefined;
        const failed = cap !== undefined && BigInt(payment.amount) > BigInt(cap);
        results.push(result("asset-caps", assetCaps, failed ? "x402_unknown_value_over_cap" : undefined));
    }
    // A payment with no host can't be checked against a host list
    if (blockHosts !== undefined) {
        const failed = host === "" || blockHosts.value.some((pattern) => hostMatches(host, pattern));
        results.push(result("block-hosts", blockHosts, failed ? "x402_host_blocked" : undefined));
    }
    if (allowHosts !== undefined) {
        const failed = host === "" || !allowHosts.value.some((pattern) => hostMatches(host, pattern));
        results.push(result("allow-hosts", allowHosts, failed ? "x402_host_blocked" : undefined));
    }
    if (untrusted !== undefined) {
        const failed = untrustedPayee(call, payment, settings);
        results.push(result("untrusted", untrusted, failed ? "x402_untrusted_payee" : undefined));
    }
    if (maxPaymentsPerRun !== undefined) {
        const failed = over(runUsed(call.run, paymentsKey(call.tool)) + 1, maxPaymentsPerRun.value);
        results.push(result("max-payments-per-run", maxPaymentsPerRun, failed ? "x402_too_many_payments" : undefined));
    }
    const runTotal = runUsed(call.run, usdKey(call.tool)) + (usd ?? 0);
    const runOver = usd !== null && over(runTotal, settings.maxPerRun.value);
    results.push(result("max-per-run", settings.maxPerRun, runOver ? "x402_over_run_limit" : undefined));
    const dayTotal = dayUsed(utcDay(), call.tool, DAY_COUNTER) + (usd ?? 0);
    const dayOver = usd !== null && over(dayTotal, settings.maxPerDay.value);
    results.push(result("max-per-day", settings.maxPerDay, dayOver ? "x402_over_day_limit" : undefined));
    if (settings.fleetCheck !== undefined) {
        results.push(fleetResult(call, payment, settings.fleetCheck));
    }
    const ask = settings.approveAbove;
    if (withApproval && ask !== undefined) {
        const above = usd !== null && over(usd, ask.value);
        results.push(result("approve-above", ask, above ? "approval_required" : undefined, "ask"));
    }
    return results;
}
