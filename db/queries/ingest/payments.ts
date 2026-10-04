import type { Insertable } from "kysely";
import type { PaymentsTable } from "../../schema/database.ts";
import type { RunItem } from "./rows.ts";

// One row per x402 payment event. Wallet addresses stay in clear.
export function paymentRows(projectId: string, items: RunItem[]): Insertable<PaymentsTable>[] {
    return items.flatMap(({ id, event }): Insertable<PaymentsTable>[] =>
        event.type === "payment"
            ? [
                  {
                      project_id: projectId,
                      event_id: id,
                      run_id: event.runId,
                      step_id: event.stepId,
                      agent: event.agent,
                      stage: event.stage,
                      host: event.host,
                      resource: event.resource,
                      x402_version: event.x402Version,
                      scheme: event.scheme,
                      network: event.network,
                      asset: event.asset,
                      amount: event.amount,
                      usd: event.usd,
                      pay_to: event.payTo,
                      tx_hash: event.transaction ?? null,
                      delivered: event.delivered ?? null,
                      reason: event.reason ?? null,
                      at: event.at,
                  },
              ]
            : [],
    );
}
