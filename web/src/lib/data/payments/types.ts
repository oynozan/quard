export type PaymentStage = "challenged" | "refused" | "signed" | "settled" | "failed";

// One x402 payment step, its events folded into the furthest stage it reached
export type Payment = {
    stepId: string;
    agent: string;
    stage: PaymentStage;
    host: string;
    // The paid URL, with secrets removed
    resource: string;
    x402Version: number;
    scheme: string;
    network: string;
    asset: string;
    // Atomic units, as text so big amounts stay exact
    amount: string;
    // Null when the token has no known USD value
    usd: number | null;
    payTo: string;
    txHash: string | null;
    // False for "paid, not delivered"
    delivered: boolean | null;
    reason: string | null;
    startedAt: number;
    at: number;
};

export type SpendItem = { label: string; usd: number; payments: number; unknown: number };

export type NewPayeeRow = {
    payTo: string;
    network: string;
    firstPaidAt: number;
    usd: number;
    payments: number;
    unknown: number;
    runs: number;
    agents: string[];
};

export type QuarantinedPayeeRow = {
    address: string;
    quarantinedAt: number;
    // Quarantined while the fleet check only observed
    observe: boolean;
    runs: number;
    blockedAttempts: number;
    usd: number;
    payments: number;
};

// x402 spend over the summary's 30 days. Only settled payments are spend.
export type SpendData = {
    startAt: number;
    endAt: number;
    // USD per UTC day, oldest first
    byDay: number[];
    totalUsd: number;
    payments: number;
    // Settled payments in tokens with no known USD value
    unknown: number;
    byAgent: SpendItem[];
    byHost: SpendItem[];
    byPayee: SpendItem[];
    newPayees: NewPayeeRow[];
    quarantined: QuarantinedPayeeRow[];
};
