import type { Label } from "@quard/shared";
import type { FailResult, GuardCall } from "../guards/call.ts";
import { textOf } from "../labels/text-of.ts";
import { signatureMode } from "../policy/state.ts";
import { findSignatures } from "../signatures/check.ts";
import { recordDecision } from "./checks.ts";

// What the agent gets to read, and its label
export type Shown = { output: unknown; label: Label };

export function withFlags(shown: Shown, flags: string[]): Shown {
    return { output: shown.output, label: { ...shown.label, flags: [...shown.label.flags, ...flags] } };
}

// Checks content against the signature feed. A "block" signature
// withholds it; a "flag" one marks it, so later calls face stricter rules.
export function signContent(call: GuardCall, shown: Shown, enforced: boolean): Shown | { blocked: FailResult } {
    const found = findSignatures(call.tool, textOf(shown.output), "content");
    const mode = enforced ? signatureMode() : "observe";
    for (const signature of found) {
        recordDecision(call, {
            guard: "signature",
            rule: signature.id,
            decision: signature.action,
            mode,
            reason: "signature_matched",
            field: signature.id,
        });
    }
    if (mode === "observe") {
        return shown;
    }
    const block = found.find((signature) => signature.action === "block");
    if (block !== undefined) {
        const reason = "content_blocked";
        return { blocked: { guard: "signature", rule: block.id, decision: "block", mode, reason, field: block.id } };
    }
    return withFlags(
        shown,
        found.map((signature) => `signature:${signature.id}`),
    );
}
