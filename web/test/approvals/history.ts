import type { AlwaysGrant, ApprovalAnswer, ApprovalDecision, ApprovalsData } from "@/lib/data/approvals";
import { DAY, HOUR, MINUTE, NOW } from "../time";
import { OPEN } from "./requests";

type Args = { name: string; value: string }[];

function standing(id: string, tool: string, agent: string, args: Args, extra: Partial<AlwaysGrant>): AlwaysGrant {
    return {
        id,
        agent,
        tool,
        argsHash: `${id.slice(6)}4b8e1d7a9f3c5e0b2d4a6c8e0f13`,
        args,
        approvedBy: "sam@example.com",
        approvedAt: NOW - 3 * DAY,
        timesUsed: 0,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        ...extra,
    };
}

// Three active grants and one revoked
export const GRANTS: AlwaysGrant[] = [
    standing("grant_c260", "rollback_service", "ops", [{ name: "service", value: "docs-site" }], {
        timesUsed: 12,
        lastUsedAt: NOW - 5 * HOUR,
    }),
    standing(
        "grant_b561",
        "pay_invoice",
        "billing",
        [
            { name: "iban", value: "BE68…7034" },
            { name: "amount", value: "2,050.00 EUR" },
            { name: "reference", value: "Litware Labs retainer" },
        ],
        { argsHash: "b5615b94b951d7d11a71513c7bcb2209", approvedBy: "li.wei@example.com", approvedAt: NOW - 2 * HOUR },
    ),
    standing(
        "grant_e5a2",
        "deploy_service",
        "ops",
        [
            { name: "service", value: "docs-site" },
            { name: "ref", value: "main" },
        ],
        { approvedAt: NOW - 9 * DAY, timesUsed: 41, lastUsedAt: NOW - 2 * HOUR },
    ),
    standing("grant_77b2", "send_email", "support", [{ name: "to", value: "b…@contoso.example" }], {
        approvedAt: NOW - 30 * DAY,
        timesUsed: 6,
        lastUsedAt: NOW - 12 * DAY,
        revokedAt: NOW - 11 * DAY,
        revokedBy: "kim@example.com",
    }),
];

export function grantById(id: string): AlwaysGrant {
    const grant = GRANTS.find((entry) => entry.id === id);
    if (!grant) throw new Error(`No grant ${id}`);
    return grant;
}

function answered(
    requestId: string,
    tool: string,
    agent: string,
    answer: ApprovalAnswer,
    by: string,
    decidedAt: number,
): ApprovalDecision {
    return {
        requestId,
        runId: `${requestId.slice(4)}9c1f7b3d4e8a9c0b1d2e3f4a5b6c`,
        stepId: "s3",
        agent,
        tool,
        answer,
        by,
        openedAt: decidedAt - 7 * MINUTE,
        decidedAt,
        argsHash: `${requestId.slice(4)}e5f60718293a4b5c6d7e8f9a0b1c`,
        args: [{ name: "amount", value: "120.00 EUR" }],
    };
}

// Past answers, newest first, with three approvals and one denial
export const DECISIONS: ApprovalDecision[] = [
    answered("apr_7ff3", "pay_invoice", "billing", "approve once", "priya@example.com", NOW - 43 * MINUTE),
    answered("apr_7fe9", "deploy_service", "ops", "always approve", "sam@example.com", NOW - 2 * HOUR),
    answered("apr_7fd2", "send_email", "support", "approve once", "priya@example.com", NOW - 5 * HOUR),
    answered("apr_7fc8", "export_contacts", "support", "deny", "kim@example.com", NOW - 26 * HOUR),
];

// Everything the approvals page shows, as fresh lists
export function approvalsData(): ApprovalsData {
    return { open: [...OPEN], grants: [...GRANTS], decisions: [...DECISIONS] };
}
