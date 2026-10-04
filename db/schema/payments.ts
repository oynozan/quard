import type { ColumnType } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;

// x402 payment steps
export type PaymentsTable = {
    project_id: string;
    event_id: string;
    run_id: string;
    step_id: string;
    agent: string;
    stage: "challenged" | "refused" | "signed" | "settled" | "failed";
    host: string;
    resource: string;
    x402_version: number;
    scheme: string;
    network: string;
    asset: string;
    // numeric comes back as text, so big amounts stay exact
    amount: ColumnType<string, string, string>;
    usd: number | null;
    pay_to: string;
    tx_hash: string | null;
    delivered: boolean | null;
    reason: string | null;
    at: Timestamp;
};
