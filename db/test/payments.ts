import type { Insertable } from "kysely";
import type { Db } from "../connect/connect.ts";
import type { PaymentsTable } from "../schema/payments.ts";

export const PAYEE = "0x" + "a".repeat(40);
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export const runOf = (n: number): string => n.toString(16).padStart(32, "0");

let next = 0;

// A run row to hang payments on
export async function addRun(db: Db, projectId: string, runId: string, agent = "billing"): Promise<void> {
    const at = new Date("2026-10-01T00:00:00.000Z");
    await db
        .insertInto("runs")
        .values({ project_id: projectId, run_id: runId, agent, origins: "{}", started_at: at, last_event_at: at })
        .execute();
}

// A settled $0.01 payment in USDC on Base, unless fields say otherwise
export function payment(
    projectId: string,
    runId: string,
    at: string,
    fields: Partial<Insertable<PaymentsTable>> = {},
): Insertable<PaymentsTable> {
    next += 1;
    return {
        project_id: projectId,
        event_id: next.toString(16).padStart(16, "e"),
        run_id: runId,
        step_id: "5".repeat(16),
        agent: "billing",
        stage: "settled",
        host: "api.example.com",
        resource: "https://api.example.com/data",
        x402_version: 2,
        scheme: "exact",
        network: "eip155:8453",
        asset: USDC,
        amount: "10000",
        usd: 0.01,
        pay_to: PAYEE,
        tx_hash: null,
        delivered: null,
        reason: null,
        at,
        ...fields,
    };
}

export async function addPayments(db: Db, rows: Insertable<PaymentsTable>[]): Promise<void> {
    await db.insertInto("payments").values(rows).execute();
}
