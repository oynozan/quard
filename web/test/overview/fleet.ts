import { DAY, HOUR, MINUTE, NOW, SECOND } from "../time";
import { decision, finished, modelCall, runId, started, stepId, toolCall, unwrappedTool } from "./events";

export const billing = { runId: runId(1), agent: "billing" };
export const support = { runId: runId(2), agent: "support" };
export const researcher = { runId: runId(3), agent: "researcher" };
export const SUPPORT_CALL = NOW - 3 * HOUR + 2 * MINUTE;

// Billing is running, support ended three hours ago and researcher went quiet yesterday
export const FLEET = [
    started(billing, NOW - 5 * MINUTE),
    modelCall(billing, stepId(1), NOW - 4 * MINUTE),
    decision(billing, stepId(1), NOW - 4 * MINUTE, {
        tool: "payInvoice",
        guard: "permission",
        rule: "requested-call",
        decision: "allow",
    }),
    decision(billing, stepId(1), NOW - 4 * MINUTE + SECOND, {
        tool: "exportAll",
        guard: "permission",
        rule: "requested-call",
        decision: "block",
        reason: "permission_denied",
    }),
    unwrappedTool(billing, stepId(1), NOW - 4 * MINUTE, "exportAll"),
    toolCall(billing, stepId(2), NOW - 3 * MINUTE, "payInvoice", "blocked"),
    decision(billing, stepId(2), NOW - 3 * MINUTE, {
        tool: "payInvoice",
        guard: "action",
        rule: "iban:from",
        decision: "block",
        reason: "value_not_from_allowed_origin",
        field: "iban",
    }),
    modelCall(billing, stepId(3), NOW - MINUTE),
    modelCall(billing, stepId(4), NOW),

    started(support, NOW - 3 * HOUR),
    modelCall(support, stepId(1), NOW - 3 * HOUR + MINUTE, "gpt-5.4"),
    toolCall(support, stepId(2), SUPPORT_CALL, "lookup"),
    decision(support, stepId(2), SUPPORT_CALL, {
        tool: "lookup",
        guard: "egress",
        rule: "allowlist",
        decision: "allow",
    }),
    decision(support, stepId(2), SUPPORT_CALL + SECOND, {
        tool: "lookup",
        guard: "source",
        rule: "source",
        decision: "flag",
        mode: "observe",
        reason: "instructions,unknown_host",
    }),
    decision(support, stepId(2), SUPPORT_CALL + 2 * SECOND, {
        tool: "lookup",
        guard: "approval",
        rule: "approval",
        decision: "ask",
        reason: "approval_required",
    }),
    decision(support, stepId(2), SUPPORT_CALL + 3 * SECOND, {
        tool: "lookup",
        guard: "signature",
        rule: "SIG-7",
        decision: "flag",
        reason: "signature_matched",
        field: "SIG-7",
    }),
    // A guard this dashboard does not know, on a step of its own so lookup stays unblocked
    decision(support, stepId(3), SUPPORT_CALL + 4 * SECOND, {
        tool: "lookup",
        guard: "budget",
        rule: "monthly",
        decision: "block",
        reason: "limit_reached",
    }),
    decision(support, stepId(2), SUPPORT_CALL + 5 * SECOND, {
        tool: "lookup",
        guard: "limit",
        rule: "max-calls-per-run",
        decision: "allow",
    }),
    decision(support, stepId(2), SUPPORT_CALL + 6 * SECOND, {
        tool: "lookup",
        guard: "limit",
        rule: "max-amount-per-run",
        decision: "allow",
    }),
    finished(support, NOW - 3 * HOUR + 5 * MINUTE),

    started(researcher, NOW - 2 * DAY),
    modelCall(researcher, stepId(1), NOW - 2 * DAY + MINUTE, "o4-mini"),
    toolCall(researcher, stepId(2), NOW - 2 * DAY + 2 * MINUTE, "search", "blocked"),
    // Too old for every 24-hour part
    decision(researcher, stepId(2), NOW - 2 * DAY + 2 * MINUTE, {
        tool: "search",
        guard: "egress",
        rule: "allowlist",
        decision: "block",
        reason: "destination_not_allowed",
    }),
    // The first moment of the hero's 24 hours, 18:50 yesterday
    modelCall(researcher, stepId(3), NOW - DAY + 10 * MINUTE, "o4-mini"),
];
