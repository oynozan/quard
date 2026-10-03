import type { GuardMode, GuardType } from "../types";

// One rule from code. Its name is stable across deploys; its hash changes with its options.
export type GuardSpec = {
    type: GuardType;
    rule: string;
    // Approval guards have no mode: they always ask.
    mode: GuardMode | null;
    hash: string;
    summary: string;
    source: "team" | "product default";
};

export type ToolSpec = {
    name: string;
    apps: string[];
    // Empty means the tool is not wrapped with guard(), so Quard can only record it.
    guards: GuardSpec[];
    // Hosted tools run inside the model call, such as hosted web search.
    hosted: boolean;
};

function rule(
    type: GuardType,
    name: string,
    mode: GuardMode | null,
    hash: string,
    summary: string,
    source: GuardSpec["source"] = "team",
): GuardSpec {
    return { type, rule: name, mode, hash, summary, source };
}

function tool(name: string, apps: string[], guards: GuardSpec[], hosted = false): ToolSpec {
    return { name, apps, guards, hosted };
}

export const FLEET_CHECK = rule(
    "limit",
    "fleet-check",
    "block",
    "71e2d9a05c3f",
    "Blocks a new IBAN, recipient or domain once a 5th run uses it within 24 hours",
    "product default",
);

export const TOOLS: ToolSpec[] = [
    tool(
        "delegate",
        ["orchestrator-app", "support-app"],
        [
            rule(
                "limit",
                "run-limits",
                "observe",
                "5c0e9a7b31d4",
                "Depth, fan-out and loop limits per run",
                "product default",
            ),
        ],
    ),
    tool("summarize", ["orchestrator-app"], []),
    tool(
        "fetch_page",
        ["orchestrator-app"],
        [
            rule(
                "source",
                "fetch_page",
                "block",
                "a71f3c09e2d8",
                "Labels pages, blocks listed domains, scans for hidden text",
            ),
        ],
    ),
    tool(
        "web_search",
        ["orchestrator-app"],
        [rule("source", "web_search", "block", "e04b6d2c9f15", "Checks consulted domains; page text is never scanned")],
        true,
    ),
    tool(
        "lookup_supplier",
        ["billing-service"],
        [rule("action", "lookup_supplier", "block", "3b8e51f0a6c2", "Only suppliers in supplier records")],
    ),
    tool(
        "get_invoice_pdf",
        ["billing-service"],
        [rule("source", "get_invoice_pdf", "block", "9d24c7e1b053", "Labels invoice files and scans them")],
    ),
    tool(
        "pay_invoice",
        ["billing-service"],
        [
            rule("limit", "pay_invoice.daily-cap", "block", "c4a90e6f2b17", "At most 50,000 EUR per day"),
            FLEET_CHECK,
            rule(
                "action",
                "pay_invoice.iban-source",
                "observe",
                "f3c81b4e07a9",
                "The IBAN must come from supplier records",
            ),
            rule("approval", "pay_invoice", null, "08b5e3d1c6f2", "Always asks a human first"),
        ],
    ),
    tool(
        "send_email",
        ["billing-service", "support-app"],
        [
            rule("limit", "send_email.per-run", "block", "2e6a0f9c4d81", "At most 20 emails per run"),
            FLEET_CHECK,
            rule(
                "egress",
                "send_email",
                "block",
                "b9d3e7a1f046",
                "Internal data only to allowlisted domains; asks for addresses first seen in outside content",
            ),
        ],
    ),
    tool(
        "read_inbox",
        ["support-app"],
        [
            rule(
                "source",
                "read_inbox",
                "block",
                "6f1c8a2e9b30",
                "Labels mail by sender, strips instructions aimed at an AI",
            ),
        ],
    ),
    tool(
        "search_docs",
        ["support-app"],
        [rule("source", "search_docs", "block", "d58e0b3a7c14", "Labels docs from mcp:docs.acme.internal")],
    ),
    tool(
        "crm_lookup",
        ["support-app"],
        [rule("source", "crm_lookup", "block", "4a7f2c9e1d63", "Labels records from mcp:crm.acme.internal")],
    ),
    tool(
        "create_ticket",
        ["support-app"],
        [rule("action", "create_ticket", "block", "8c3e6b0f5a29", "The ticket's customer must match the sender")],
    ),
    tool(
        "refund_order",
        ["support-app"],
        [rule("approval", "refund_order", null, "1f9d4a6e2c08", "Always asks a human first")],
    ),
    tool("export_contacts", ["support-app"], []),
    tool(
        "label_thread",
        ["support-app"],
        [rule("limit", "label_thread", "block", "e7b2c05d9a41", "At most 50 labels per run")],
    ),
    tool(
        "receive_message",
        ["support-app"],
        [
            rule(
                "source",
                "receive_message",
                "block",
                "0d6b9e3f7a52",
                "Labels messages with the labels the sender attached",
            ),
        ],
    ),
    tool(
        "run_tests",
        ["deploy-runner"],
        [rule("limit", "run_tests", "block", "5a1e8c3b6f90", "At most 5 test runs per run")],
    ),
    tool("read_build_log", ["deploy-runner"], []),
    tool(
        "deploy_service",
        ["deploy-runner"],
        [rule("action", "deploy_service", "block", "c2f7a4e09b16", "Production deploys ask before running")],
    ),
    tool(
        "rollback_service",
        ["deploy-runner"],
        [rule("approval", "rollback_service", null, "9e05b2d8c7a3", "Always asks a human first")],
    ),
    tool(
        "post_slack",
        ["deploy-runner"],
        [rule("egress", "post_slack", "block", "3d8a1f6c0e57", "Only to the #deploys webhook")],
    ),
];

const BY_NAME = new Map(TOOLS.map((spec) => [spec.name, spec]));

export function toolSpec(name: string): ToolSpec {
    return BY_NAME.get(name) ?? { name, apps: [], guards: [], hosted: false };
}

export function isGuarded(name: string): boolean {
    return toolSpec(name).guards.length > 0;
}
