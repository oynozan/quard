import type { ApprovalArgDetail, ApprovalDetail, Heartbeat } from "@/lib/data/approvals";
import type { GuardDecision, RunRow } from "@/lib/data/runs/types";
import type { Label, PathNode } from "@/lib/data/types";
import { guardDecision } from "../approvals-overview/fixtures";
import { HOUR, MINUTE, NOW, SECOND } from "../time";

export const RUN_PAY = "4bf92f3577b34da6a3ce929d0e0e4736";
export const RUN_REFUND = "c3a8f0d2e5b14976a0c2d8e1f6b3a947";
export const RUN_REFUND_AGAIN = "7d41e0c9a8b24f6e9c3d1a5b2e8f0c47";
export const RUN_DEPLOY = "e81b5c2d9f3a4e7b8c6d0a1f2e3b4c5d";
export const RUN_PAYOUT = "a90c7e3f1b2d4c5e6f7a8b9c0d1e2f3a";

const WEB: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const WEB_INTERNAL: Label = { ...WEB, sensitivity: "internal" };
const RESEARCHER: Label = { origin: "agent:researcher", trust: "untrusted", sensitivity: "internal" };
const LOOKUP: Label = { origin: "tool:lookup_supplier", trust: "trusted", sensitivity: "internal" };
const INBOX: Label = { origin: "email:inbox", trust: "untrusted", sensitivity: "internal" };
const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

function arg(name: string, value: string, extra: Partial<ApprovalArgDetail> = {}): ApprovalArgDetail {
    return { name, value, origins: [], kind: "text", traced: false, masked: value, appearances: [], ...extra };
}

function node(kind: PathNode["kind"], title: string, label: Label, at: number, runId: string): PathNode {
    return { kind, role: null, title, detail: "", agent: null, runId, stepId: `${title}-${at}`, label, at };
}

function run(id: string, agents: string[], startedAt: number): RunRow {
    return {
        id,
        rootAgent: agents[0]!,
        agents,
        status: "waiting",
        startedAt,
        durationMs: NOW - startedAt,
        steps: 8,
        costUsd: 0.02,
        decisions: { allowed: 3, asked: 1, blocked: 0 },
        untrusted: agents.length > 1,
        tools: [],
        incidentId: null,
        approvalId: null,
    };
}

function live(lastAt: number): Heartbeat {
    return { state: "live", lastAt, intervalMs: 15 * SECOND, stoppedReason: null };
}

function stopped(lastAt: number): Heartbeat {
    return { state: "stopped", lastAt, intervalMs: 15 * SECOND, stoppedReason: "The function hit its time limit" };
}

function ask(tool: string, reason: string): GuardDecision {
    return guardDecision({ guard: "approval", tool, rule: tool, ruleHash: "d4", outcome: "ask", mode: null, reason });
}

type Spec = Omit<ApprovalDetail, "request" | "identicalWaiting" | "joined"> &
    Pick<ApprovalDetail["request"], "id" | "stepId" | "agent" | "tool" | "reason" | "openedAt"> &
    Partial<Pick<ApprovalDetail, "joined">>;

// Builds the request header from the fields each fixture names
function detail({ id, stepId, agent, tool, reason, openedAt, joined = [], ...rest }: Spec): ApprovalDetail {
    return {
        ...rest,
        request: {
            id,
            runId: rest.run.id,
            stepId,
            agent,
            tool,
            args: rest.args,
            reason,
            openedAt,
            waiting: rest.heartbeat.state === "live",
        },
        identicalWaiting: joined.length > 0,
        joined,
    };
}

const PAY_OPENED = NOW - 4 * MINUTE;
const PAY_REASON = "pay_invoice always asks a human first";

// A live payment whose IBAN and reference came from an untrusted page, 2 checks passed
const PAY = detail({
    id: "apr_7f31",
    stepId: "s14",
    agent: "billing",
    tool: "pay_invoice",
    reason: PAY_REASON,
    openedAt: PAY_OPENED,
    args: [
        arg("iban", "DE89 3704 0044 0532 0130 00", {
            kind: "iban",
            traced: true,
            masked: "DE89…3000",
            origins: [WEB, RESEARCHER],
        }),
        arg("amount", "4,950.00 EUR", { kind: "amount" }),
        arg("reference", "INV-20931", { kind: "id", traced: true, origins: [WEB, RESEARCHER, LOOKUP] }),
    ],
    path: [
        node("origin", "supplier-portal.example", WEB, PAY_OPENED - 12 * SECOND, RUN_PAY),
        node("agent", "researcher", WEB, PAY_OPENED - 9 * SECOND, RUN_PAY),
        node("handoff", "researcher to billing", RESEARCHER, PAY_OPENED - 6 * SECOND, RUN_PAY),
        node("agent", "billing", WEB_INTERNAL, PAY_OPENED - 3 * SECOND, RUN_PAY),
        node("call", "pay_invoice", WEB_INTERNAL, PAY_OPENED, RUN_PAY),
    ],
    context: WEB_INTERNAL,
    decisions: [
        guardDecision({ guard: "limit", rule: "pay_invoice.max-calls", ruleHash: "a1", reason: "3 of 20 calls" }),
        guardDecision({ guard: "limit", rule: "pay_invoice.max-amount", ruleHash: "b2", outcome: "pass" }),
        guardDecision({
            rule: "pay_invoice.iban-source",
            ruleHash: "c3",
            outcome: "block",
            mode: "observe",
            reason: "The IBAN first appeared in web content",
        }),
        ask("pay_invoice", PAY_REASON),
    ],
    heartbeat: live(NOW - 6 * SECOND),
    argsHash: "9f2c4e1ab7d05e3c8a61f4b2d9e07c13",
    run: run(RUN_PAY, ["researcher", "billing"], PAY_OPENED - 2 * MINUTE),
});

const REFUND_OPENED = NOW - 9 * MINUTE;

// A live email that one identical call from another run also waits on
const REFUND = detail({
    id: "apr_7f2c",
    stepId: "s6",
    agent: "support",
    tool: "send_email",
    reason: "Emails to a new address ask a human first",
    openedAt: REFUND_OPENED,
    args: [
        arg("to", "r.ortiz@claims-desk.io", {
            kind: "email",
            traced: true,
            masked: "r…@claims-desk.io",
            origins: [INBOX],
        }),
        arg("subject", "Your refund for order 118-4402"),
        arg("body", "Refund approved for 312.00 EUR. It reaches the original card in 5 to 7 days."),
    ],
    path: [
        node("origin", "inbox", INBOX, REFUND_OPENED - 20 * SECOND, RUN_REFUND),
        node("agent", "support", INBOX, REFUND_OPENED - 10 * SECOND, RUN_REFUND),
        node("call", "send_email", INBOX, REFUND_OPENED, RUN_REFUND),
    ],
    context: INBOX,
    decisions: [ask("send_email", "Emails to a new address ask a human first")],
    heartbeat: live(NOW - 11 * SECOND),
    joined: [{ runId: RUN_REFUND_AGAIN, stepId: "s4", agent: "support", since: NOW - 3 * MINUTE }],
    argsHash: "5b81e84b68786266fd976df1eee2d3aa",
    run: run(RUN_REFUND, ["support"], REFUND_OPENED - MINUTE),
});

const DEPLOY_OPENED = NOW - 52 * MINUTE;

// A stopped deploy whose commit the model wrote itself
const DEPLOY = detail({
    id: "apr_7f1e",
    stepId: "s9",
    agent: "ops",
    tool: "deploy_service",
    reason: "deploy_service asks a human before production",
    openedAt: DEPLOY_OPENED,
    args: [
        arg("service", "docs-site", { origins: [USER] }),
        arg("commit", "a41c9e0f", { kind: "id", traced: true, generated: true }),
    ],
    path: [
        node("origin", "user", USER, DEPLOY_OPENED - 30 * SECOND, RUN_DEPLOY),
        node("call", "deploy_service", USER, DEPLOY_OPENED, RUN_DEPLOY),
    ],
    context: USER,
    decisions: [ask("deploy_service", "deploy_service asks a human before production")],
    heartbeat: stopped(DEPLOY_OPENED + 5 * MINUTE),
    argsHash: "e81b07c4d2a95f3e6b1c8d0a7f4e2b95",
    run: run(RUN_DEPLOY, ["ops"], DEPLOY_OPENED - MINUTE),
});

const PAYOUT_OPENED = NOW - 2 * HOUR;

// A stopped refund where every value came from trusted records
const PAYOUT = detail({
    id: "apr_7f0a",
    stepId: "s5",
    agent: "billing",
    tool: "refund_payment",
    reason: "refund_payment always asks a human first",
    openedAt: PAYOUT_OPENED,
    args: [
        arg("iban", "NL91 ABNA 0417 1643 00", { kind: "iban", traced: true, masked: "NL91…4300", origins: [LOOKUP] }),
        arg("amount", "1,200.00 EUR", { kind: "amount" }),
    ],
    path: [
        node("origin", "lookup_supplier", LOOKUP, PAYOUT_OPENED - 15 * SECOND, RUN_PAYOUT),
        node("call", "refund_payment", LOOKUP, PAYOUT_OPENED, RUN_PAYOUT),
    ],
    context: LOOKUP,
    decisions: [ask("refund_payment", "refund_payment always asks a human first")],
    heartbeat: stopped(PAYOUT_OPENED + 5 * MINUTE),
    argsHash: "0a7c3e9b5d1f4a2c8e6b0d9f3a5c7e1b",
    run: run(RUN_PAYOUT, ["billing"], PAYOUT_OPENED - MINUTE),
});

// Open requests, newest first, as a query would list them
export const OPEN: ApprovalDetail[] = [PAY, REFUND, DEPLOY, PAYOUT];

export function openRequest(id: string): ApprovalDetail {
    const item = OPEN.find((entry) => entry.request.id === id);
    if (!item) throw new Error(`No open request ${id}`);
    return item;
}
