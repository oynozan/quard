// Refusal text comes only from these fixed templates.
// It never quotes values or content, only tool and rule names from code.

export type ReasonCode =
    | "permission_denied"
    | "value_not_from_allowed_origin"
    | "value_model_generated"
    | "amount_over_cap"
    | "recipient_never_seen"
    | "destination_not_allowed"
    | "destination_from_untrusted_content"
    | "limit_reached"
    | "approval_required"
    | "approval_unavailable"
    | "approval_denied"
    | "content_blocked"
    | "rule_failed"
    | "signature_matched"
    | "sensitive_data";

const REASONS: Record<ReasonCode, (field: string) => string> = {
    permission_denied: () => "this agent is not allowed to use this tool",
    value_not_from_allowed_origin: (field) => `the ${field} value did not come from an allowed source`,
    value_model_generated: (field) => `the ${field} value did not appear in any content this run read`,
    amount_over_cap: (field) => `the ${field} value is over the allowed limit`,
    recipient_never_seen: (field) => `the ${field} value has not been seen in trusted content`,
    destination_not_allowed: () => "internal data may only go to allowed destinations",
    destination_from_untrusted_content: () => "the destination first appeared in untrusted content",
    limit_reached: () => "a limit for this run was reached",
    approval_required: () => "it needs a human approval",
    approval_unavailable: () => "it needs a human approval and none could be asked",
    approval_denied: () => "a human denied it",
    content_blocked: () => "the content looked unsafe",
    rule_failed: (field) => `the ${field} value failed a rule`,
    // field is a signature id from the feed, which only allows A-Z, 0-9 and dashes
    signature_matched: (field) => `it matched the known attack signature ${field}`,
    // field is the kind of data found: secret, card number or IBAN
    sensitive_data: (field) => `the data to send holds a sensitive value (${field})`,
};

export type RefusalInput = {
    guard: string;
    tool: string;
    reason: ReasonCode;
    field?: string;
};

export function refusalText(input: RefusalInput): string {
    const why = REASONS[input.reason](input.field ?? "argument");
    if (input.reason === "content_blocked") {
        return `Blocked by the ${input.guard} guard: ${why}. The ${input.tool} result was withheld. Do not retry it; tell the user what was blocked.`;
    }
    return `Blocked by the ${input.guard} guard: ${why}. The ${input.tool} call did NOT run. Do not retry it; tell the user what was blocked.`;
}
