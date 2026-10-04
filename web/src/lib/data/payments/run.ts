import type { PaymentRow } from "@quard/db";
import type { Payment, PaymentStage } from "./types";

// How far a payment got. A later event at the same time wins only when it got further.
const RANK: Record<PaymentStage, number> = { challenged: 0, refused: 1, signed: 1, settled: 2, failed: 2 };

const isLater = (a: Payment, b: Payment) => a.at > b.at || (a.at === b.at && RANK[a.stage] >= RANK[b.stage]);

function paymentOf(row: PaymentRow): Payment {
    const at = row.at.getTime();
    return {
        stepId: row.stepId,
        agent: row.agent,
        stage: row.stage,
        host: row.host,
        resource: row.resource,
        x402Version: row.x402Version,
        scheme: row.scheme,
        network: row.network,
        asset: row.asset,
        amount: row.amount,
        usd: row.usd,
        payTo: row.payTo,
        txHash: row.txHash,
        delivered: row.delivered,
        reason: row.reason,
        startedAt: at,
        at,
    };
}

// One payment per step, oldest first. Its latest event gives the stage and price.
export function paymentsOf(rows: PaymentRow[]): Payment[] {
    const steps = new Map<string, Payment>();
    for (const row of rows) {
        const event = paymentOf(row);
        const seen = steps.get(row.stepId);
        if (!seen) {
            steps.set(row.stepId, event);
            continue;
        }
        const [next, other] = isLater(event, seen) ? [event, seen] : [seen, event];
        steps.set(row.stepId, {
            ...next,
            startedAt: Math.min(next.startedAt, other.startedAt),
            txHash: next.txHash ?? other.txHash,
            delivered: next.delivered ?? other.delivered,
            reason: next.reason ?? other.reason,
        });
    }
    return [...steps.values()].sort((a, b) => a.startedAt - b.startedAt);
}
