import type { GuardCall, RuleResult } from "../guards/call.ts";
import { textOf } from "../labels/text-of.ts";
import { feedMissing, signatureFeed, signatureMode } from "../policy/state.ts";
import { matchSignatures, type CompiledSignature } from "./matcher.ts";

// The feed's signatures that match a text. None when no feed is set.
export function findSignatures(tool: string, text: string, where: "input" | "content"): CompiledSignature[] {
    const feed = signatureFeed();
    return feed === undefined ? [] : matchSignatures(feed, text, where, tool);
}

// Checks a call's arguments against the feed. A "block" signature
// blocks the call; a "flag" one sends it to a human.
export function checkSignatureInput(call: GuardCall): RuleResult[] {
    const mode = signatureMode();
    // Fail closed: no call runs unchecked while the feed can't be loaded
    if (feedMissing()) {
        return [{ guard: "signature", rule: "feed", decision: "block", mode, reason: "signatures_unavailable" }];
    }
    return findSignatures(call.tool, textOf(call.input), "input").map((found) => ({
        guard: "signature",
        rule: found.id,
        decision: found.action === "block" ? "block" : "ask",
        mode,
        reason: "signature_matched",
        field: found.id,
    }));
}
