import { valueAtPath, type ReasonCode } from "@quard/shared";
import { exactOccurrences, valuesAt } from "../../labels/value-labels.ts";
import type { GuardCall, Mode, RuleResult } from "../call.ts";
import type { ActionOptions, ActionRule } from "../options.ts";

// "tool" matches any tool origin; "tool:getSupplier" matches one tool
export function matchesOrigin(origin: string, allowed: readonly string[]): boolean {
    return allowed.some((entry) => origin === entry || origin.startsWith(`${entry}:`));
}

export function readAmount(input: unknown, field: string): number | undefined {
    const value = valueAtPath(input, field);
    if (value === undefined) {
        return undefined;
    }
    return typeof value === "number" ? value : Number(value);
}

// The rule name decision events and the rules list use
export function ruleName(rule: ActionRule): string {
    if ("check" in rule) {
        return rule.name;
    }
    if ("from" in rule) {
        return rule.name ?? `${rule.field}:from`;
    }
    return "max" in rule ? (rule.name ?? `${rule.field}:max`) : (rule.name ?? `${rule.field}:never-seen`);
}

function outcome(
    rule: string,
    mode: Mode,
    failed: boolean,
    onFail: "block" | "ask",
    reason: ReasonCode,
    field: string,
): RuleResult {
    if (!failed) {
        return { guard: "action", rule, decision: "allow", mode };
    }
    return { guard: "action", rule, decision: onFail, mode, reason, field };
}

function evaluate(call: GuardCall, rule: ActionRule, mode: Mode): RuleResult {
    if ("check" in rule) {
        const result = rule.check(call);
        const decision = typeof result === "string" ? result : result.decision;
        if (decision === "allow") {
            return { guard: "action", rule: rule.name, decision, mode };
        }
        const field = typeof result === "string" ? undefined : result.field;
        return { guard: "action", rule: rule.name, decision, mode, reason: "rule_failed", field: field ?? "argument" };
    }
    if ("from" in rule) {
        // Every traced value must itself have appeared in an allowed origin.
        // Host or domain look-alikes and flagged content never count.
        const values = valuesAt(call.values, rule.field);
        const allowed =
            values.length > 0 &&
            values.every((value) =>
                exactOccurrences(value).some((o) => o.flags.length === 0 && matchesOrigin(o.origin, rule.from)),
            );
        const reason = values.some((v) => v.modelGenerated) ? "value_model_generated" : "value_not_from_allowed_origin";
        return outcome(ruleName(rule), mode, !allowed, rule.onFail ?? "block", reason, rule.field);
    }
    if ("max" in rule) {
        const amount = readAmount(call.input, rule.field);
        const over = amount !== undefined && !(amount <= rule.max);
        return outcome(ruleName(rule), mode, over, rule.onFail ?? "block", "amount_over_cap", rule.field);
    }
    // A value counts as seen when it first appeared in trusted, unflagged content.
    // Never-seen values go to a human unless the rule says otherwise.
    const values = valuesAt(call.values, rule.field);
    const seen =
        values.length > 0 &&
        values.every((value) => {
            const first = exactOccurrences(value)[0];
            return first !== undefined && first.trust === "trusted" && first.flags.length === 0;
        });
    return outcome(ruleName(rule), mode, !seen, rule.onFail ?? "ask", "recipient_never_seen", rule.field);
}

export function checkAction(call: GuardCall, options: ActionOptions): RuleResult[] {
    return options.rules.map((rule) => evaluate(call, rule, options.mode ?? "block"));
}
