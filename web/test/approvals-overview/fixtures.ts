import { vi } from "vitest";
import type { ApprovalDetail } from "@/lib/data/approvals";
import { MINUTE, NOW, SECOND } from "../time";
import type { GuardDecision } from "@/lib/data/runs/types";
import type { ApprovalArg, Label, PathNode } from "@/lib/data/types";

// One guard result, with the fields a test cares about overridden
export function guardDecision(overrides: Partial<GuardDecision> = {}): GuardDecision {
    return {
        guard: "action",
        tool: "pay_invoice",
        outcome: "allow",
        mode: "block",
        rule: "pay_invoice.daily-cap",
        ruleHash: "c4a90e6f2b17",
        rulesHash: "a1b2c3d4e5f6",
        reason: "23,350 of 50,000 EUR today",
        degraded: false,
        scan: null,
        ...overrides,
    };
}

export const PAY = "apr_7f31c0d2a9b84e15";
export const EMAIL = "apr_7f2c5a90e1d3b874";
export const DEPLOY = "apr_7f1e88b04c2d9a61";
export const CONTOSO = "apr_7f0a3d6e9b1c5f27";

export const PAY_RUN = "4bf92f3577b34da6a3ce929d0e0e4736";
export const JOINED_RUN = "5b8e2f1a9c3d7e6b4a0f8d2c6e1b9a37";

const WEB: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const WEB_READ: Label = { ...WEB, sensitivity: "internal" };
const RESEARCHER: Label = { origin: "agent:researcher", trust: "untrusted", sensitivity: "internal" };
const LOOKUP: Label = { origin: "tool:lookup_supplier", trust: "trusted", sensitivity: "internal" };
const INBOX: Label = { origin: "email:inbound", trust: "untrusted", sensitivity: "public" };
const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };
const INVOICES: Label = { origin: "file:/srv/invoices", trust: "trusted", sensitivity: "internal" };

type Arg = ApprovalArg & { masked: string };

function arg(name: string, value: string, origins: Label[] = [], extra: Partial<Arg> = {}): Arg {
    return { name, value, masked: value, origins, traced: origins.length > 0, ...extra };
}

function node(kind: PathNode["kind"], title: string, label: Label, at: number, runId = PAY_RUN): PathNode {
    return { kind, role: null, title, detail: "", agent: null, runId, stepId: `${kind}-${title}`, label, at };
}

type Open = Omit<ApprovalDetail, "request"> & { request: Omit<ApprovalDetail["request"], "args" | "waiting"> };

function plain({ name, value, origins, traced, generated }: Arg): ApprovalArg {
    return { name, value, origins, traced, ...(generated ? { generated } : {}) };
}

// The request keeps the args without masks and says whether a call still waits
function detail(open: Open): ApprovalDetail {
    const request = { ...open.request, args: open.args.map(plain), waiting: open.heartbeat.state === "live" };
    return { ...open, request };
}

const ASKS = "pay_invoice asks a human first";

// A payment to an IBAN that first appeared on a supplier's web page
export function payInvoice(): ApprovalDetail {
    const openedAt = NOW - 4 * MINUTE;
    return detail({
        request: {
            id: PAY,
            runId: PAY_RUN,
            stepId: "a1b2c3d4e5f60718",
            agent: "billing",
            tool: "pay_invoice",
            reason: ASKS,
            openedAt,
        },
        args: [
            arg("iban", "DE89 3704 0044 0532 0130 00", [WEB], { masked: "DE89…3000" }),
            arg("amount", "4950"),
            arg("reference", "INV-20931", [WEB, RESEARCHER, LOOKUP]),
        ],
        path: [
            node("origin", "supplier-portal.example", WEB, openedAt - 12 * SECOND),
            node("agent", "researcher", WEB, openedAt - 9 * SECOND),
            node("handoff", "researcher to billing", RESEARCHER, openedAt - 6 * SECOND),
            node("agent", "billing", WEB_READ, openedAt - 3 * SECOND),
            node("call", "pay_invoice", WEB_READ, openedAt),
        ],
        decisions: [
            guardDecision({ guard: "approval", rule: "pay_invoice", outcome: "ask", mode: null, reason: ASKS }),
            guardDecision({
                rule: "pay_invoice.iban-source",
                ruleHash: "b2",
                outcome: "block",
                mode: "observe",
                reason: "The IBAN first appeared in web content",
            }),
            guardDecision({ ruleHash: "c3" }),
            guardDecision({ guard: "limit", rule: "fleet-check", ruleHash: "d4", outcome: "pass", reason: "" }),
        ],
        heartbeat: { state: "live", lastAt: NOW - 6 * SECOND },
        joined: [],
        argsHash: "3f9a0c1d2e4b5a69c8d7e6f5a4b3c2d1",
    });
}

// A refund email that a second, identical call waits on too
export function sendEmail(): ApprovalDetail {
    const openedAt = NOW - 11 * MINUTE;
    return detail({
        request: {
            id: EMAIL,
            runId: "9c1e04b8d2a7f6e3c5b8a1d4e7f20c93",
            stepId: "b2c3d4e5f6071829",
            agent: "support",
            tool: "send_email",
            reason: "Recipient never seen",
            openedAt,
        },
        args: [
            arg("to", "refunds@claims-desk.io", [INBOX], { masked: "r…@claims-desk.io" }),
            arg("subject", "Your refund for order 118-4402"),
        ],
        path: [node("origin", "inbound", INBOX, openedAt - 20 * SECOND), node("call", "send_email", INBOX, openedAt)],
        decisions: [],
        heartbeat: { state: "live", lastAt: NOW - 11 * SECOND },
        joined: [{ runId: JOINED_RUN, stepId: "c3d4e5f60718293a", agent: "support", since: openedAt + MINUTE }],
        argsHash: "5b81e84b68786266fd976df1eee2d3aa",
    });
}

// A deploy whose process stopped, with a commit the model made up
export function deployService(): ApprovalDetail {
    const openedAt = NOW - 52 * MINUTE;
    return detail({
        request: {
            id: DEPLOY,
            runId: "e2d4a6b8c0f1e3d5a7b9c1d3e5f7a9b1",
            stepId: "d4e5f60718293a4b",
            agent: "deploy-bot",
            tool: "deploy_service",
            reason: "deploy_service asks a human first",
            openedAt,
        },
        args: [
            arg("service", "docs-site", [USER]),
            arg("environment", "production"),
            arg("commit", "a41c9e0f", [], { traced: true, generated: true }),
        ],
        path: [node("origin", "user", USER, openedAt - 30 * SECOND), node("call", "deploy_service", USER, openedAt)],
        decisions: [guardDecision({ guard: "approval", tool: "deploy_service", rule: "deploy", outcome: "ask" })],
        heartbeat: { state: "stopped", lastAt: openedAt + 5 * MINUTE },
        joined: [],
        argsHash: "8d0f2e4c6a8b0d2f4e6a8c0e2f4a6c8e",
    });
}

// A payment from a trusted invoice file, after its process stopped
export function contosoPayment(): ApprovalDetail {
    const openedAt = NOW - 80 * MINUTE;
    return detail({
        request: {
            id: CONTOSO,
            runId: "0af7651916cd43dd8448eb211c80319c",
            stepId: "e5f60718293a4b5c",
            agent: "billing",
            tool: "pay_invoice",
            reason: ASKS,
            openedAt,
        },
        args: [arg("iban", "NL91 ABNA 0417 1643 00", [INVOICES], { masked: "NL91…4300" }), arg("amount", "1280")],
        path: [],
        decisions: [],
        heartbeat: { state: "stopped", lastAt: openedAt + 5 * MINUTE },
        joined: [],
        argsHash: "1c3e5a7c9e1a3c5e7a9c1e3a5c7e9a1c",
    });
}

// The open requests, newest first
export function openRequests(): ApprovalDetail[] {
    return [payInvoice(), sendEmail(), deployService(), contosoPayment()];
}

// One sample open request by id
export function openRequest(id: string): ApprovalDetail {
    const item = openRequests().find((entry) => entry.request.id === id);
    if (!item) throw new Error(`No sample request ${id}`);
    return item;
}

// jsdom has no ResizeObserver. Charts keep their starting width.
class StillObserver {
    observe() {}
    disconnect() {}
}

export function stubResizeObserver() {
    vi.stubGlobal("ResizeObserver", StillObserver);
}
