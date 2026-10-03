import { findSensitive, flattenArgs, maskSensitive, type SensitiveKind } from "@quard/shared";
import { isPlain } from "../../pipeline/snapshot.ts";
import { currentPreset } from "../../policy/state.ts";
import type { GuardCall, RuleResult } from "../call.ts";
import type { DataAction, EgressOptions, GuardOptions } from "../options.ts";
import { mapStrings } from "../source/strip.ts";

const KINDS: SensitiveKind[] = ["secrets", "cards", "ibans"];

// What a refusal calls each kind
const NAMES: Record<SensitiveKind, string> = { secrets: "secret", cards: "card number", ibans: "IBAN" };

function actionFor(options: EgressOptions, kind: SensitiveKind): DataAction {
    return options.payload?.[kind] ?? currentPreset().payload[kind];
}

// Masks the kinds that enforcing egress guards mask, in string values of
// plain data. Returns undefined when nothing changed.
// ponytail: cyclic arguments overflow the stack here, which fails closed
export function maskArgs(list: readonly GuardOptions[], args: unknown[]): unknown[] | undefined {
    const kinds = new Set(
        list.flatMap((options) =>
            options.type === "egress" && (options.mode ?? "block") === "block"
                ? KINDS.filter((kind) => actionFor(options, kind) === "mask")
                : [],
        ),
    );
    if (kinds.size === 0 || !isPlain(args)) {
        return undefined;
    }
    let changed = false;
    const masked = mapStrings(args, (text) => {
        const next = maskSensitive(text, kinds);
        changed ||= next !== text;
        return next;
    });
    return changed ? (masked as unknown[]) : undefined;
}

// Finds secrets, card numbers and IBANs in the data sent, after masking.
// A kind the guard masks but that is still there could not be masked,
// such as a card number passed as a number, so it is blocked.
export function checkPayload(call: GuardCall, options: EgressOptions): RuleResult[] {
    const mode = options.mode ?? "block";
    const found = flattenArgs(call.input).flatMap((item) => findSensitive(item.value).map((value) => value.kind));
    return [...new Set(found)].map((kind): RuleResult => {
        const action = actionFor(options, kind);
        if (action === "allow" || (action === "mask" && mode === "observe")) {
            return { guard: "egress", rule: `payload:${kind}:${action}`, decision: "allow", mode };
        }
        return {
            guard: "egress",
            rule: `payload:${kind}`,
            decision: "block",
            mode,
            reason: "sensitive_data",
            field: NAMES[kind],
        };
    });
}
