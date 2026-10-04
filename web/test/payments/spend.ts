import type { Payment, SpendData } from "@/lib/data/payments/types";
import { NOW } from "../time";
import { START_AT } from "../summary/fleet";

export const PAYEE = "0x" + "a".repeat(40);
export const OTHER = "0x" + "b".repeat(40);
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const zeros = (length: number): number[] => Array.from({ length }, () => 0);

// Nothing paid in the window, with fields swapped as a test needs
export function emptySpend(changes: Partial<SpendData> = {}): SpendData {
    return {
        startAt: START_AT,
        endAt: NOW,
        byDay: zeros(30),
        totalUsd: 0,
        payments: 0,
        unknown: 0,
        byAgent: [],
        byHost: [],
        byPayee: [],
        newPayees: [],
        quarantined: [],
        ...changes,
    };
}

// Two paid days, two payees, one new and one quarantined
export function fullSpend(): SpendData {
    const byDay = zeros(30);
    byDay[27] = 0.25;
    byDay[29] = 0.5;
    return emptySpend({
        byDay,
        totalUsd: 0.75,
        payments: 4,
        unknown: 1,
        byAgent: [
            { label: "billing", usd: 0.5, payments: 2, unknown: 0 },
            { label: "research", usd: 0.25, payments: 2, unknown: 1 },
        ],
        byHost: [{ label: "api.example.com", usd: 0.75, payments: 4, unknown: 1 }],
        byPayee: [
            { label: OTHER, usd: 0, payments: 1, unknown: 1 },
            { label: PAYEE, usd: 0.75, payments: 3, unknown: 0 },
        ],
        newPayees: [
            {
                payTo: PAYEE,
                network: "eip155:8453",
                firstPaidAt: START_AT + 27 * 86_400_000,
                usd: 0.75,
                payments: 3,
                unknown: 1,
                runs: 2,
                agents: ["billing", "research"],
            },
        ],
        quarantined: [
            {
                address: OTHER,
                quarantinedAt: START_AT + 29 * 86_400_000,
                observe: true,
                runs: 5,
                blockedAttempts: 2,
                usd: 0.01,
                payments: 1,
            },
        ],
    });
}

// A settled $0.01 payment in USDC on Base
export function makePayment(fields: Partial<Payment> = {}): Payment {
    return {
        stepId: "5".repeat(16),
        agent: "billing",
        stage: "settled",
        host: "api.example.com",
        resource: "https://api.example.com/data",
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC,
        amount: "10000",
        usd: 0.01,
        payTo: PAYEE,
        txHash: "0x" + "f".repeat(64),
        delivered: true,
        reason: null,
        startedAt: NOW - 5000,
        at: NOW - 4000,
        ...fields,
    };
}
