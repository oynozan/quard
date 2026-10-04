import type { AlwaysGrant, ApprovalDecision, ApprovalsData } from "@/lib/data/approvals";
import { DAY, HOUR, MINUTE, NOW } from "../time";
import { openRequests } from "./fixtures";

function grant(fields: Partial<AlwaysGrant> & Pick<AlwaysGrant, "id" | "agent" | "tool" | "args">): AlwaysGrant {
    return {
        argsHash: `${fields.id.slice(4)}${"0".repeat(16)}`,
        approvedBy: "dana@acme.com",
        approvedAt: NOW - DAY,
        timesUsed: 0,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        ...fields,
    };
}

export const LITWARE = "grt_e5a2b7c19d04f6e3";
export const DOCS = "grt_3e1c09a7f5b2d468";
export const ROLLBACK = "grt_c260d4b8e2a6f913";
export const REVOKED = "grt_77b2f0e4a8c6d195";

// "Always approve" grants, newest first, one of them revoked
export function grants(): AlwaysGrant[] {
    return [
        grant({
            id: LITWARE,
            agent: "billing",
            tool: "pay_invoice",
            args: [
                { name: "iban", value: "BE68…7034" },
                { name: "amount", value: "2,050.00 EUR" },
                { name: "reference", value: "Litware Labs retainer" },
            ],
            argsHash: "b5615b94b951d7d11a71513c7bcb2209",
            approvedBy: "li.wei@acme.com",
            approvedAt: NOW - HOUR - 45 * MINUTE,
        }),
        grant({
            id: REVOKED,
            agent: "billing",
            tool: "pay_invoice",
            args: [{ name: "reference", value: "CF-77164" }],
            approvedBy: "marco@acme.com",
            approvedAt: NOW - 12 * DAY,
            timesUsed: 1,
            lastUsedAt: NOW - 12 * DAY,
            revokedAt: NOW - 11 * DAY,
            revokedBy: "dana@acme.com",
        }),
        grant({
            id: DOCS,
            agent: "deploy-bot",
            tool: "deploy_service",
            args: [
                { name: "service", value: "docs-site" },
                { name: "environment", value: "production" },
            ],
            approvedBy: "marco@acme.com",
            approvedAt: NOW - 19 * DAY,
            timesUsed: 41,
            lastUsedAt: NOW - 2 * HOUR,
        }),
        grant({
            id: ROLLBACK,
            agent: "deploy-bot",
            tool: "rollback_service",
            args: [{ name: "service", value: "status-page" }],
            approvedAt: NOW - 27 * DAY,
            timesUsed: 4,
            lastUsedAt: NOW - 9 * DAY,
        }),
        grant({
            id: "grt_9a04e6c2b8d1f357",
            agent: "deploy-bot",
            tool: "deploy_service",
            args: [{ name: "service", value: "status-page" }],
            approvedAt: NOW - 33 * DAY,
            timesUsed: 12,
            lastUsedAt: NOW - 4 * DAY,
        }),
    ];
}

function decision(fields: Partial<ApprovalDecision> & Pick<ApprovalDecision, "requestId" | "tool">): ApprovalDecision {
    return {
        runId: `${fields.requestId.slice(4)}${"0".repeat(16)}`,
        stepId: fields.requestId.slice(4),
        agent: "billing",
        answer: "approve once",
        by: "dana@acme.com",
        openedAt: NOW - DAY,
        decidedAt: NOW - DAY + MINUTE,
        argsHash: `${fields.requestId.slice(4)}${"f".repeat(16)}`,
        args: [],
        ...fields,
    };
}

export const LATEST = "apr_7ff3a1c4e8b2d6f0";

// Past answers, newest first
export function decisions(): ApprovalDecision[] {
    return [
        decision({ requestId: LATEST, tool: "pay_invoice", by: "priya@acme.com", decidedAt: NOW - 43 * MINUTE }),
        decision({
            requestId: "apr_7fe2b5d8a1c4e7f0",
            agent: "support",
            tool: "send_email",
            answer: "always approve",
            decidedAt: NOW - 80 * MINUTE,
        }),
        decision({
            requestId: "apr_7fd1c6e9b2d5a8f1",
            agent: "deploy-bot",
            tool: "deploy_service",
            answer: "deny",
            by: "marco@acme.com",
            decidedAt: NOW - 2 * HOUR,
        }),
        decision({ requestId: "apr_7fc0d7f0c3e6b9a2", tool: "pay_invoice", decidedAt: NOW - 5 * HOUR }),
        decision({
            requestId: "apr_7fb9e8a1d4f7c0b3",
            agent: "deploy-bot",
            tool: "rollback_service",
            decidedAt: NOW - DAY,
        }),
    ];
}

// Everything the approvals page shows
export function approvalsData(changes: Partial<ApprovalsData> = {}): ApprovalsData {
    return { open: openRequests(), more: 0, grants: grants(), decisions: decisions(), ...changes };
}
