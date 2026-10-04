import { recordDecision } from "../../pipeline/checks.ts";
import { dayTotals } from "../../pipeline/count/days.ts";
import { reportChunk } from "../../pipeline/count/fleet.ts";
import { addToRun, type RunAdd } from "../../pipeline/count/run-add.ts";
import { activeControl } from "../../transport/link/active.ts";
import type { Control } from "../../transport/link/control.ts";
import type { FailResult, GuardCall, RuleResult } from "../call.ts";
import { utcDay } from "../limit/daily.ts";
import { isShared } from "../limit/run-counts.ts";
import { DAY_COUNTER, payeeValue, paymentsKey, usdKey } from "./checks.ts";
import type { Payment } from "./payment.ts";
import type { Setting, X402Settings } from "./settings.ts";

type Cap = { rule: string; setting: Setting<number> | undefined; reason: FailResult["reason"] };

function enforced(setting: Setting<number> | undefined): number | undefined {
    return setting?.mode === "block" ? setting.value : undefined;
}

// Block mode refuses at the first cap passed; observe mode records a
// "would block" the checks before did not already record
function overCaps(
    call: GuardCall,
    caps: readonly Cap[],
    totals: readonly number[],
    checked: readonly RuleResult[],
): FailResult | undefined {
    const flagged = new Set(checked.filter((done) => done.decision !== "allow").map((done) => done.rule));
    let stop: FailResult | undefined;
    caps.forEach(({ rule, setting, reason }, index) => {
        if (setting === undefined || stop !== undefined || !((totals[index] as number) > setting.value)) {
            return;
        }
        const result: FailResult = { guard: "x402", rule, decision: "block", mode: setting.mode, reason };
        if (result.mode === "block" || !flagged.has(rule)) {
            recordDecision(call, result);
        }
        stop = result.mode === "block" ? result : undefined;
    });
    return stop;
}

// The run's payment count and USD total, through control for a run that spans processes
async function countRun(
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    checked: readonly RuleResult[],
): Promise<{ stop: FailResult | undefined; undo: () => void }> {
    const adds: RunAdd[] = [{ counter: paymentsKey(call.tool), add: 1, max: enforced(settings.maxPaymentsPerRun) }];
    const caps: Cap[] = [
        { rule: "max-payments-per-run", setting: settings.maxPaymentsPerRun, reason: "x402_too_many_payments" },
    ];
    if (payment.usd !== null && payment.usd > 0) {
        adds.push({ counter: usdKey(call.tool), add: payment.usd, max: enforced(settings.maxPerRun) });
        caps.push({ rule: "max-per-run", setting: settings.maxPerRun, reason: "x402_over_run_limit" });
    }
    const shared = isShared(call.run);
    const totals = await addToRun(shared ? activeControl() : undefined, call.run, adds);
    // Control only adds to a shared run, so only local counts are taken back
    const undo = () => {
        for (const { counter, add } of shared ? [] : adds) {
            call.run.counters.set(counter, (call.run.counters.get(counter) as number) - add);
        }
    };
    return { stop: overCaps(call, caps, totals, checked), undo };
}

async function countDay(
    control: Control | undefined,
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    if (payment.usd === null || payment.usd === 0) {
        return undefined;
    }
    const { value, mode } = settings.maxPerDay;
    const counter = { counter: DAY_COUNTER, add: payment.usd, caps: [{ rule: "max-per-day", max: value, mode }] };
    const totals = await dayTotals(control, call.tool, [counter], utcDay());
    const caps: Cap[] = [{ rule: "max-per-day", setting: settings.maxPerDay, reason: "x402_over_day_limit" }];
    return overCaps(call, caps, totals, checked);
}

// Reports the payee to control and refuses it once quarantined
async function reportPayee(
    control: Control | undefined,
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const found = settings.fleetCheck;
    const value = payeeValue(payment.payTo);
    if (found === undefined || control === undefined || value === undefined) {
        return undefined;
    }
    const use = { runId: call.runId, agent: call.agent, tool: call.tool, blocked: false, values: [value] };
    if (!control.link.ready()) {
        control.replays.keepUse(use);
        return undefined;
    }
    const match = await reportChunk(control, use, found.mode);
    if (match === undefined) {
        return undefined;
    }
    const result: FailResult = { ...match, guard: "x402", reason: "x402_payee_quarantined" };
    const flagged = checked.some((done) => done.rule === "fleet-check" && done.decision !== "allow");
    if (result.mode === "block" || !flagged) {
        recordDecision(call, result);
    }
    return result.mode === "block" ? result : undefined;
}

// Counts a payment the checks allowed before it is signed, so parallel
// payments can't race past a cap. A later refusal takes back local run counts.
export async function countPayment(
    call: GuardCall,
    payment: Payment,
    settings: X402Settings,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    const control = activeControl();
    const run = await countRun(call, payment, settings, checked);
    // A run cap passed added nothing, so there is nothing to take back
    if (run.stop !== undefined) {
        return run.stop;
    }
    const stop =
        (await countDay(control, call, payment, settings, checked)) ??
        (await reportPayee(control, call, payment, settings, checked));
    if (stop !== undefined) {
        run.undo();
    }
    return stop;
}

// A refused payment still counts as a use of its payee
export function reportRefusedPayee(call: GuardCall, payment: Payment, settings: X402Settings): void {
    const control = activeControl();
    const value = payeeValue(payment.payTo);
    if (settings.fleetCheck !== undefined && control !== undefined && value !== undefined) {
        control.replays.use({ runId: call.runId, agent: call.agent, tool: call.tool, blocked: true, values: [value] });
    }
}
