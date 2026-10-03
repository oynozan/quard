import { NOW, HOUR, DAY } from "../rng";

// An agent's model, instructions and tools are recorded once per version.
export type AgentVersion = {
    version: string;
    model: string;
    instructionsHash: string;
    tools: string[];
    since: number;
    note: string;
};

// Newest first per agent.
export const AGENT_VERSIONS: Record<string, AgentVersion[]> = {
    orchestrator: [
        {
            version: "v14",
            model: "gpt-6.1",
            instructionsHash: "4e1a9c07b2d5",
            tools: ["delegate", "summarize"],
            since: NOW - 6 * DAY - 5 * HOUR,
            note: "Sends supplier questions to researcher first",
        },
        {
            version: "v13",
            model: "gpt-6.1",
            instructionsHash: "b30f6d18e9c2",
            tools: ["delegate", "summarize"],
            since: NOW - 19 * DAY,
            note: "Moved to gpt-6.1",
        },
        {
            version: "v12",
            model: "gpt-6",
            instructionsHash: "b30f6d18e9c2",
            tools: ["delegate", "summarize"],
            since: NOW - 41 * DAY,
            note: "Added summarize",
        },
    ],
    researcher: [
        {
            version: "v9",
            model: "gpt-6.1-mini",
            instructionsHash: "91c3e5a0f7b4",
            tools: ["fetch_page", "web_search", "delegate"],
            since: NOW - 6 * DAY - 5 * HOUR,
            note: "Can hand work to billing directly",
        },
        {
            version: "v8",
            model: "gpt-6.1-mini",
            instructionsHash: "2d8b0e6c4a19",
            tools: ["fetch_page", "web_search"],
            since: NOW - 19 * DAY,
            note: "Added hosted web search",
        },
        {
            version: "v7",
            model: "gpt-6-mini",
            instructionsHash: "2d8b0e6c4a19",
            tools: ["fetch_page"],
            since: NOW - 52 * DAY,
            note: "First version",
        },
    ],
    billing: [
        {
            version: "v22",
            model: "gpt-6.1",
            instructionsHash: "e6f04b9a2c31",
            tools: ["lookup_supplier", "get_invoice_pdf", "pay_invoice", "send_email"],
            since: NOW - 3 * DAY - 2 * HOUR,
            note: "Looks up the supplier before every payment",
        },
        {
            version: "v21",
            model: "gpt-6.1",
            instructionsHash: "7b29d1f8e0a6",
            tools: ["lookup_supplier", "get_invoice_pdf", "pay_invoice", "send_email"],
            since: NOW - 16 * DAY,
            note: "Reads invoice PDFs",
        },
        {
            version: "v20",
            model: "gpt-6",
            instructionsHash: "c0a8e3b6d4f2",
            tools: ["lookup_supplier", "pay_invoice", "send_email"],
            since: NOW - 44 * DAY,
            note: "pay_invoice wrapped with an approval guard",
        },
    ],
    support: [
        {
            version: "v31",
            model: "gpt-6.1-mini",
            instructionsHash: "5d7e2a9c1f08",
            tools: ["read_inbox", "search_docs", "crm_lookup", "create_ticket", "refund_order", "send_email"],
            since: NOW - 20 * HOUR,
            note: "Removed export_contacts after inc_115",
        },
        {
            version: "v30",
            model: "gpt-6.1-mini",
            instructionsHash: "a4c91f3e6b27",
            tools: [
                "read_inbox",
                "search_docs",
                "crm_lookup",
                "create_ticket",
                "refund_order",
                "export_contacts",
                "send_email",
            ],
            since: NOW - 12 * DAY,
            note: "Added export_contacts",
        },
        {
            version: "v29",
            model: "gpt-6.1-mini",
            instructionsHash: "f81b6d0c3e95",
            tools: ["read_inbox", "search_docs", "crm_lookup", "create_ticket", "refund_order", "send_email"],
            since: NOW - 33 * DAY,
            note: "Added refund_order",
        },
    ],
    "inbox-triage": [
        {
            version: "v5",
            model: "gpt-6.1-mini",
            instructionsHash: "0e9a4c7d2b61",
            tools: ["read_inbox", "label_thread", "delegate"],
            since: NOW - 20 * HOUR,
            note: "Hands refunds to support over the queue",
        },
        {
            version: "v4",
            model: "gpt-6.1-mini",
            instructionsHash: "6c2f8e1a9d34",
            tools: ["read_inbox", "label_thread", "delegate"],
            since: NOW - 27 * DAY,
            note: "First version on the queue",
        },
    ],
    "deploy-bot": [
        {
            version: "v3",
            model: "gpt-6.1",
            instructionsHash: "b7d03e5f9a12",
            tools: ["run_tests", "read_build_log", "deploy_service", "rollback_service", "post_slack"],
            since: NOW - 24 * DAY,
            note: "Reads build logs before deploying",
        },
        {
            version: "v2",
            model: "gpt-6",
            instructionsHash: "3a6e9c0d8f45",
            tools: ["run_tests", "deploy_service", "post_slack"],
            since: NOW - 58 * DAY,
            note: "Production deploys ask first",
        },
    ],
};

export function versionsOf(agent: string): AgentVersion[] {
    return AGENT_VERSIONS[agent] ?? [];
}

// The version an agent ran at a given time.
export function versionAt(agent: string, time: number): AgentVersion {
    const versions = versionsOf(agent);
    const found = versions.find((version) => version.since <= time) ?? versions[versions.length - 1];
    return (
        found ?? {
            version: "v1",
            model: "gpt-6.1-mini",
            instructionsHash: "000000000000",
            tools: [],
            since: 0,
            note: "",
        }
    );
}
