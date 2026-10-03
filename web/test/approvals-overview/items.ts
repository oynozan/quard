import type { ApprovalGrantItem, ApprovalWaiter, DecidedApprovalItem, OpenApprovalItem } from "@quard/db";
import { RUN, T1, T2, at } from "../runs-fixture";

// Approval rows as @quard/db returns them, for the payInvoice call of the run in runs-fixture

export const REQUEST = "apr_0123456789abcdef";
export const HASH = "c".repeat(32);

export function waiter(fields: Partial<ApprovalWaiter> = {}): ApprovalWaiter {
    return {
        askId: "a".repeat(16),
        runId: RUN,
        stepId: T2,
        agent: "billing",
        since: at(6),
        lastBeatAt: at(20),
        doneAt: null,
        ...fields,
    };
}

// The payment waits for a human: its IBAN came from a web page the model read
export function openItem(fields: Partial<OpenApprovalItem> = {}): OpenApprovalItem {
    return {
        id: REQUEST,
        runId: RUN,
        stepId: T2,
        agent: "billing",
        tool: "payInvoice",
        argsHash: HASH,
        args: { iban: "GB33 BUKB 2020 1555 5555", amount: 4950, memo: "Invoice 114" },
        masked: { iban: "GB33…5555", amount: 4950, memo: "Invoice 114" },
        labels: [
            {
                path: "iban",
                values: [
                    {
                        type: "iban",
                        generated: false,
                        origins: [
                            {
                                origin: "web:acme-billing.net",
                                trust: "untrusted",
                                sensitivity: "public",
                                flags: ["instructions"],
                                stepId: T1,
                                match: "exact",
                            },
                        ],
                    },
                ],
            },
            { path: "amount", values: [] },
            { path: "memo", values: [] },
        ],
        context: {
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["system", "user", "web:acme-billing.net"],
            flagged: true,
        },
        reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
        rulesHash: "d".repeat(16),
        openedAt: at(6),
        waiters: [waiter()],
        ...fields,
    };
}

export function decidedItem(fields: Partial<DecidedApprovalItem> = {}): DecidedApprovalItem {
    const open = openItem();
    return {
        id: open.id,
        runId: open.runId,
        stepId: open.stepId,
        agent: open.agent,
        tool: open.tool,
        argsHash: open.argsHash,
        masked: open.masked,
        labels: open.labels,
        context: open.context,
        reasons: open.reasons,
        rulesHash: open.rulesHash,
        openedAt: open.openedAt,
        answer: "once",
        decidedBy: "dana@acme.com",
        decidedAt: at(30),
        usedBy: null,
        usedAt: null,
        ...fields,
    };
}

export function grantItem(fields: Partial<ApprovalGrantItem> = {}): ApprovalGrantItem {
    return {
        id: "grt_0123456789abcdef",
        requestId: REQUEST,
        agent: "billing",
        tool: "payInvoice",
        argsHash: HASH,
        masked: { iban: "GB33…5555", amount: 4950 },
        approvedBy: "@dana-k",
        approvedAt: at(30),
        timesUsed: 3,
        lastUsedAt: at(90),
        revokedAt: null,
        revokedBy: null,
        ...fields,
    };
}
