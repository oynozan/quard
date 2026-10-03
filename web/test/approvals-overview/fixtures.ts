import type { GuardDecision } from "@/lib/data/runs/types";

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
