import type { Db } from "../../connect/connect.ts";

export type PaymentStage = "challenged" | "refused" | "signed" | "settled" | "failed";

// One payment event. Amounts are atomic units, kept as text so they stay exact.
export type PaymentRow = {
    eventId: string;
    stepId: string;
    agent: string;
    stage: PaymentStage;
    host: string;
    resource: string;
    x402Version: number;
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    // Null when the token has no known USD value
    usd: number | null;
    payTo: string;
    txHash: string | null;
    // False for "paid, not delivered"
    delivered: boolean | null;
    reason: string | null;
    at: Date;
};

export const PAYMENT_COLUMNS = [
    "event_id as eventId",
    "step_id as stepId",
    "agent",
    "stage",
    "host",
    "resource",
    "x402_version as x402Version",
    "scheme",
    "network",
    "asset",
    "amount",
    "usd",
    "pay_to as payTo",
    "tx_hash as txHash",
    "delivered",
    "reason",
    "at",
] as const;

// Every payment event of one run, oldest first
export async function runPayments(db: Db, projectId: string, runId: string): Promise<PaymentRow[]> {
    return db
        .selectFrom("payments")
        .select(PAYMENT_COLUMNS)
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .orderBy("at")
        .orderBy("event_id")
        .execute();
}
