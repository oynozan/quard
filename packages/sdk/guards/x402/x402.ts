import { newStepId } from "@quard/shared";
import { now, record } from "../../core/recorder.ts";
import { GuardRefusal } from "../../core/refusal.ts";
import { registerGuardedTool } from "../../context/registry.ts";
import { currentScope, newScope } from "../../context/scope.ts";
import { labelArguments } from "../../labels/value-labels.ts";
import { askHuman } from "../../pipeline/approval/human.ts";
import { asksOf, decide, recordDecision } from "../../pipeline/checks.ts";
import { policyOptions, refreshSources, sourcesReady } from "../../policy/state.ts";
import { syncRules } from "../../transport/link/active.ts";
import { markChecked } from "../../x402/checked.ts";
import { keptScope } from "../../x402/record/payments.ts";
import type { FailResult, GuardCall, RuleResult } from "../call.ts";
import type { X402Options } from "../options.ts";
import { checkPayment } from "./checks.ts";
import type { PaymentCreationContext, X402Client } from "./client.ts";
import { countPayment, reportRefusedPayee } from "./count.ts";
import { noteRefused } from "./frame.ts";
import { paidHost, paymentInput, readPayment, type Payment } from "./payment.ts";
import { checkX402Options, x402Settings, type X402Settings } from "./settings.ts";

type Abort = { abort: true; reason: string };

// The payment as a call, so decisions and approvals work as for tools.
// Outside a run it joins the run x402Fetch or x402Mcp saw its price in.
function paymentCall(name: string, payment: Payment): GuardCall {
    const scope = currentScope() ?? keptScope(payment) ?? newScope();
    const input = paymentInput(payment);
    return {
        tool: name,
        input,
        agent: scope.agent,
        runId: scope.run.runId,
        stepId: newStepId(),
        context: scope.run.index.context(),
        values: labelArguments(input, scope.run.index),
        run: scope.run,
        depth: scope.depth,
    };
}

function recordRefused(call: GuardCall, payment: Payment, reason: string): void {
    record({
        type: "payment",
        runId: call.runId,
        stepId: call.stepId,
        agent: call.agent,
        at: now(),
        stage: "refused",
        host: payment.host,
        resource: payment.resource,
        x402Version: payment.x402Version,
        scheme: payment.scheme,
        network: payment.network,
        asset: payment.asset,
        amount: payment.amount,
        usd: payment.usd,
        payTo: payment.payTo,
        reason,
    });
}

// Records the refusal and aborts the payment before it is signed
function refuse(
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    result: FailResult,
    options: X402Options,
): Abort {
    recordRefused(call, payment, result.reason);
    reportRefusedPayee(call, payment, settings);
    const refusal = new GuardRefusal({ guard: "x402", tool: call.tool, reason: result.reason });
    noteRefused({ refusal, onBlock: options.onBlock ?? "return" });
    return { abort: true, reason: refusal.text };
}

function recordAll(call: GuardCall, results: readonly RuleResult[]): void {
    results.forEach((result) => recordDecision(call, result));
}

async function beforePayment(
    name: string,
    code: X402Options,
    context: PaymentCreationContext,
): Promise<Abort | undefined> {
    // A changed policy file applies from this payment on
    refreshSources(Date.now());
    await sourcesReady();
    syncRules();
    const options = policyOptions(name)?.find((item): item is X402Options => item.type === "x402") ?? code;
    const settings = x402Settings(options);
    const payment = readPayment(context);
    const call = paymentCall(name, payment);

    let checked = checkPayment(call, payment, settings, true);
    recordAll(call, checked);
    let final = decide(checked);
    // The person answers before signing: a signed payment soon expires
    if (final?.decision === "ask") {
        const answer = await askHuman(call, asksOf(checked), undefined);
        if (answer !== "approved") {
            return refuse(call, payment, settings, answer, options);
        }
        checked = checkPayment(call, payment, settings, false);
        recordAll(call, checked);
        final = decide(checked);
    }
    const stop = final ?? (await countPayment(call, payment, settings, checked));
    return stop === undefined ? undefined : refuse(call, payment, settings, stop, options);
}

/**
 * Checks every payment an @x402/core x402Client makes before it is
 * signed, and returns the client. A refused payment is never signed:
 * the client throws an error whose message holds the refusal text.
 * Inside a guard()-wrapped tool, the tool returns the refusal instead,
 * as for any other guard; with onBlock: "throw" it throws
 * GuardBlockedError. Outside one, pass the error message to the model.
 */
export function x402<C extends X402Client>(client: C, options: X402Options): C {
    if ((options.type as string) !== "x402") {
        throw new Error('quard.x402() takes options with type: "x402"');
    }
    checkX402Options(options);
    const name = options.name ?? "x402";
    registerGuardedTool(name, [options]);
    syncRules();
    client.onBeforePaymentCreation((context) => beforePayment(name, options, context));
    // x402Fetch sends the payment only to the host the checks ran on
    client.onAfterPaymentCreation(async (context) => markChecked(context.paymentPayload, paidHost(context)));
    return client;
}
