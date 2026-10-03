import type { OpenApprovalItem } from "@quard/db";

// A reason code in plain words: "value_not_from_allowed_origin" reads "Value not from allowed origin"
export function reasonWords(code: string): string {
    const words = code.replaceAll(",", ", ").replaceAll("_", " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// One rule's reason for asking. The approval guard itself always asks.
export function reasonText(code: string, tool: string): string {
    return code === "approval_required" ? `${tool} asks a human first` : reasonWords(code);
}

// Why the call waits for a human: each asking rule's reason, once
export function requestReason(reasons: OpenApprovalItem["reasons"], tool: string): string {
    const texts = [...new Set(reasons.map((reason) => reasonText(reason.reason, tool)).filter(Boolean))];
    return texts.length > 0 ? texts.join(" · ") : reasonText("approval_required", tool);
}
