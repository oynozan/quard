import type { RuleRow } from "@/lib/data/settings";

// Three rules, one per mode: block, observe and an approval that always asks
export const RULES: RuleRow[] = [
    {
        name: "refund-cap",
        guard: "limit",
        tools: ["refund", "credit"],
        apps: ["billing-service"],
        mode: "block",
        hash: "a1b2c3d4e5f6",
        summary: "Refunds above 500 stop",
        source: "team",
    },
    {
        name: "crm-reads",
        guard: "source",
        tools: ["crm.lookup"],
        apps: ["support-app", "orchestrator-app"],
        mode: "observe",
        hash: "0f9e8d7c6b5a",
        summary: "Watch CRM reads",
        source: "product default",
    },
    {
        name: "payout-approval",
        guard: "approval",
        tools: [],
        apps: [],
        mode: null,
        hash: "77aa88bb99cc",
        summary: "Payouts always ask",
        source: "team",
    },
];
