import { vi } from "vitest";
import { getApprovals } from "@/lib/data/approvals";
import type { ApprovalDetail } from "@/lib/data/approvals";
import type { GuardDecision } from "@/lib/data/runs/types";

// One guard result. Tests override the fields they care about.
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

// The sample open request with this id, as the approvals page loads it.
export async function openRequest(id: string): Promise<ApprovalDetail> {
    const { open } = await getApprovals();
    const item = open.find((entry) => entry.request.id === id);
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
