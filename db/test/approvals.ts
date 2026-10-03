import type { ApprovalRequestInput, ApprovalWaiterInput } from "../queries/approvals/types.ts";

export const RUN = "1".repeat(32);
export const STEP = "2".repeat(16);
export const HASH = "c".repeat(32);
export const RULES = "d".repeat(16);

let next = 0;

// A fresh ask id, 16 hex characters like the SDK's
export function askId(): string {
    next += 1;
    return next.toString(16).padStart(16, "0");
}

// A payInvoice call that waits for a human
export function requestInput(fields: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
    return {
        runId: RUN,
        stepId: STEP,
        agent: "billing",
        tool: "payInvoice",
        argsHash: HASH,
        args: { iban: "DE89370400440532013000", amount: 4950 },
        masked: { iban: "DE89…3000", amount: 4950 },
        labels: [
            {
                path: "iban",
                values: [
                    {
                        type: "iban",
                        origins: [
                            {
                                origin: "web:acme-billing.net",
                                trust: "untrusted",
                                sensitivity: "public",
                                flags: [],
                                stepId: STEP,
                                match: "exact",
                            },
                        ],
                        generated: false,
                    },
                ],
            },
        ],
        context: { trust: "untrusted", sensitivity: "public", origins: ["web:acme-billing.net"], flagged: false },
        reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
        rulesHash: RULES,
        ...fields,
    };
}

export function waiterInput(requestId: string, fields: Partial<ApprovalWaiterInput> = {}): ApprovalWaiterInput {
    return { askId: askId(), requestId, runId: RUN, stepId: STEP, agent: "billing", ...fields };
}
