import type { Db } from "@quard/db";
import { PAYEE, USDC } from "./spend";

type Stage = "challenged" | "refused" | "signed" | "settled" | "failed";

// What a test sets on a stored payment row
export type PaymentFields = {
    stepId?: string;
    agent?: string;
    stage?: Stage;
    host?: string;
    usd?: number | null;
    payTo?: string;
    network?: string;
    txHash?: string | null;
    delivered?: boolean | null;
    reason?: string | null;
};

let next = 0;

// A run row to hang payments on, unless ingest already made one
export async function addRun(db: Db, projectId: string, runId: string): Promise<void> {
    const at = new Date("2026-10-01T00:00:00.000Z");
    await db
        .insertInto("runs")
        .values({
            project_id: projectId,
            run_id: runId,
            agent: "billing",
            origins: "{}",
            started_at: at,
            last_event_at: at,
        })
        .execute();
}

// Settled $0.01 payments in USDC on Base, unless the fields say otherwise
export async function addPayment(
    db: Db,
    projectId: string,
    runId: string,
    at: number,
    fields: PaymentFields = {},
): Promise<void> {
    next += 1;
    await db
        .insertInto("payments")
        .values({
            project_id: projectId,
            event_id: next.toString(16).padStart(16, "e"),
            run_id: runId,
            step_id: fields.stepId ?? "5".repeat(16),
            agent: fields.agent ?? "billing",
            stage: fields.stage ?? "settled",
            host: fields.host ?? "api.example.com",
            resource: "https://api.example.com/data",
            x402_version: 2,
            scheme: "exact",
            network: fields.network ?? "eip155:8453",
            asset: USDC,
            amount: "10000",
            usd: fields.usd === undefined ? 0.01 : fields.usd,
            pay_to: fields.payTo ?? PAYEE,
            tx_hash: fields.txHash ?? null,
            delivered: fields.delivered ?? null,
            reason: fields.reason ?? null,
            at: new Date(at),
        })
        .execute();
}
