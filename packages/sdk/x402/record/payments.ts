import {
    newStepId,
    paidOption,
    usdValue,
    x402VersionOf,
    type PaymentEvent,
    type PaymentOption,
    type PaymentRequired,
    type PaymentResponse,
} from "@quard/shared";
import { now, record } from "../../core/recorder.ts";
import { currentScope, newScope, type Scope } from "../../context/scope.ts";

// Records x402 payment events for fetch and MCP alike. A price is kept
// per resource, so a v1 payment finds its option and a payment made
// outside a run joins the run that saw its price.

export type Place = { key: string; host: string; resource: string };

type Seen = { price: PaymentRequired; scope: Scope };

const MAX_PRICES = 1_000;
const prices = new Map<string, Seen>();
let warned = false;

export function scopeFor(place: Place): Scope {
    return currentScope() ?? prices.get(place.key)?.scope ?? newScope();
}

function keep(key: string, seen: Seen): void {
    prices.delete(key);
    prices.set(key, seen);
    if (prices.size > MAX_PRICES) {
        prices.delete(prices.keys().next().value as string);
    }
}

type Extra = Pick<PaymentEvent, "transaction" | "delivered" | "reason"> & { amount?: string };

function recordStage(
    scope: Scope,
    stepId: string,
    place: Place,
    stage: PaymentEvent["stage"],
    version: number,
    option: PaymentOption,
    extra: Extra = {},
): void {
    const amount = extra.amount ?? option.amount;
    record({
        type: "payment",
        runId: scope.run.runId,
        stepId,
        agent: scope.agent,
        at: now(),
        stage,
        host: place.host.slice(0, 500),
        resource: place.resource.slice(0, 2000),
        x402Version: version,
        scheme: option.scheme,
        network: option.network,
        asset: option.asset,
        amount,
        usd: usdValue(option.asset, amount),
        payTo: option.payTo,
        ...(extra.transaction ? { transaction: extra.transaction } : {}),
        ...(extra.delivered === undefined ? {} : { delivered: extra.delivered }),
        ...(extra.reason === undefined ? {} : { reason: extra.reason.slice(0, 100) }),
    });
}

// A price request: the option the server lists first stands for it
export function recordPrice(place: Place, price: PaymentRequired): void {
    const scope = scopeFor(place);
    keep(place.key, { price, scope });
    recordStage(scope, newStepId(), place, "challenged", price.x402Version, price.accepts[0] as PaymentOption);
}

// One paid request: its payment, then how it ended
export type PaidStep = { scope: Scope; stepId: string; place: Place; version: number; option?: PaymentOption };

export function paidStep(place: Place, payment: unknown): PaidStep {
    const price = prices.get(place.key)?.price;
    return {
        scope: scopeFor(place),
        stepId: newStepId(),
        place,
        version: x402VersionOf(payment, price),
        option: paidOption(payment, price),
    };
}

function recordStep(step: PaidStep, stage: PaymentEvent["stage"], extra?: Extra): void {
    if (step.option !== undefined) {
        recordStage(step.scope, step.stepId, step.place, stage, step.version, step.option, extra);
    }
}

export function recordSigned(step: PaidStep): void {
    recordStep(step, "signed");
}

export function recordRefused(step: PaidStep, reason: string): void {
    recordStep(step, "refused", { reason });
}

// A settlement. A settled payment whose response is an error is "paid, not delivered".
export function recordSettlement(step: PaidStep, settlement: PaymentResponse, delivered: boolean): void {
    // An upto payment settles the amount it used, at most the one signed
    const amount = /^\d{1,78}$/.test(settlement.amount ?? "") ? settlement.amount : undefined;
    const extra = { transaction: settlement.transaction, amount };
    if (settlement.success) {
        recordStep(step, "settled", { ...extra, delivered });
    } else {
        recordStep(step, "failed", { ...extra, reason: settlement.errorReason ?? "settle_failed" });
    }
}

// A payment the server turned down with no settlement
export function recordRejected(step: PaidStep, reason: string | undefined): void {
    recordStep(step, "failed", { reason: reason ?? "payment_rejected" });
}

// A signed payment no x402 guard checked, warned once per process
export function warnUnguarded(step: PaidStep): void {
    if (!warned) {
        warned = true;
        record({
            type: "warning",
            runId: step.scope.run.runId,
            stepId: step.stepId,
            agent: step.scope.agent,
            at: now(),
            code: "unguarded_x402",
        });
    }
}

export function clearPayments(): void {
    prices.clear();
    warned = false;
}
