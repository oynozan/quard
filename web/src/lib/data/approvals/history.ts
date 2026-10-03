import { maskValue } from "../../mask";
import { NOW, MINUTE, HOUR, DAY } from "../rng";
import { catalogRuns } from "../runs/catalog";
import { argsHash } from "../values/hash";
import { SUPPLIERS } from "../values/pool";
import type { AlwaysGrant, ApprovalDecision } from "./types";

type GrantSpec = Omit<AlwaysGrant, "argsHash" | "args" | "lastUsedAt" | "timesUsed"> & {
    raw: Record<string, string>;
    usedBefore: number;
    lastUsedBefore: number | null;
};

// "Always approve" answers, bound to the agent, the tool and the argument hash.
const GRANTS: GrantSpec[] = [
    {
        id: "grant_e5a2",
        agent: "billing",
        tool: "pay_invoice",
        raw: { iban: SUPPLIERS[4].iban, amount: "2,050.00 EUR", reference: "Litware Labs retainer" },
        approvedBy: "li.wei@acme.com",
        approvedAt: NOW - 1 * HOUR - 45 * MINUTE,
        usedBefore: 0,
        lastUsedBefore: null,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "grant_3e1c",
        agent: "deploy-bot",
        tool: "deploy_service",
        raw: { service: "docs-site", environment: "production", ref: "main" },
        approvedBy: "marco@acme.com",
        approvedAt: NOW - 19 * DAY - 3 * HOUR,
        usedBefore: 37,
        lastUsedBefore: NOW - 1 * DAY - 6 * HOUR,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "grant_9a04",
        agent: "deploy-bot",
        tool: "deploy_service",
        raw: { service: "status-page", environment: "production", ref: "main" },
        approvedBy: "li.wei@acme.com",
        approvedAt: NOW - 33 * DAY,
        usedBefore: 12,
        lastUsedBefore: NOW - 4 * DAY - 2 * HOUR,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "grant_c260",
        agent: "deploy-bot",
        tool: "rollback_service",
        raw: { service: "status-page", to: "previous" },
        approvedBy: "dana@acme.com",
        approvedAt: NOW - 27 * DAY,
        usedBefore: 4,
        lastUsedBefore: NOW - 9 * DAY,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "grant_51d7",
        agent: "billing",
        tool: "pay_invoice",
        raw: { iban: SUPPLIERS[3].iban, amount: "899.00 EUR", reference: "Tailspin hosting plan" },
        approvedBy: "priya@acme.com",
        approvedAt: NOW - 64 * DAY,
        usedBefore: 2,
        lastUsedBefore: NOW - 3 * DAY - 5 * HOUR,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "grant_77b2",
        agent: "billing",
        tool: "pay_invoice",
        raw: { iban: SUPPLIERS[1].iban, amount: "640.00 EUR", reference: "CF-77164" },
        approvedBy: "marco@acme.com",
        approvedAt: NOW - 12 * DAY,
        usedBefore: 1,
        lastUsedBefore: NOW - 12 * DAY,
        revokedAt: NOW - 11 * DAY,
        revokedBy: "dana@acme.com",
    },
];

// Grants, newest first, with their use counts. Uses in listed runs add to older ones.
export function alwaysGrants(): AlwaysGrant[] {
    const uses = new Map<string, number[]>();
    for (const run of catalogRuns()) {
        for (const step of run.detail.steps) {
            const grant = step.guard?.reason.match(/always-approve grant (grant_[0-9a-f]+)/)?.[1];
            if (grant) uses.set(grant, [...(uses.get(grant) ?? []), step.startedAt]);
        }
    }
    const answers = catalogRuns().flatMap((run) => run.built.approvals.filter((r) => r.answer === "always approve"));
    return GRANTS.map(({ raw, usedBefore, lastUsedBefore, ...grant }) => {
        const recent = uses.get(grant.id) ?? [];
        const args = Object.entries(raw).map(([name, value]) => ({ name, value }));
        const hash = argsHash(grant.agent, grant.tool, args);
        // A grant given in a listed run takes its time and approver from that answer.
        const given = answers.find((answer) => answer.argsHash === hash);
        return {
            ...grant,
            approvedBy: given?.by ?? grant.approvedBy,
            approvedAt: given?.decidedAt ?? grant.approvedAt,
            argsHash: hash,
            args: args.map((arg) => ({ name: arg.name, value: maskValue(arg.value) })),
            timesUsed: usedBefore + recent.length,
            lastUsedAt: recent.length ? Math.max(...recent) : lastUsedBefore,
        };
    }).sort((a, b) => b.approvedAt - a.approvedAt);
}

// Answers people gave, newest first, from every listed run.
export function recentDecisions(limit = 40): ApprovalDecision[] {
    return catalogRuns()
        .flatMap((run) => run.built.approvals)
        .sort((a, b) => b.decidedAt - a.decidedAt)
        .slice(0, limit)
        .map((record) => ({
            requestId: record.requestId,
            runId: record.runId,
            stepId: record.stepId,
            agent: record.agent,
            tool: record.tool,
            answer: record.answer,
            by: record.by,
            openedAt: record.openedAt,
            decidedAt: record.decidedAt,
            argsHash: record.argsHash,
            args: record.args,
        }));
}
