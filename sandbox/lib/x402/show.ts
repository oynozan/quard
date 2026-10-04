import type { RunEvent } from "quard";

type PaymentEvent = Extract<RunEvent, { type: "payment" }>;

const short = (value: string) => (value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value);

const STAGES: Record<PaymentEvent["stage"], string> = {
    challenged: "price asked",
    refused: "refused before signing",
    signed: "signed",
    settled: "settled",
    failed: "failed",
};

// One line per payment event: stage, amount, payee and settlement
export function paymentLine(event: PaymentEvent): string {
    const amount = event.usd === null ? `${event.amount} units` : `$${event.usd.toFixed(2)}`;
    const tx = event.transaction === undefined ? "" : `, tx ${short(event.transaction)}`;
    const delivered = event.delivered === false ? ", paid, not delivered" : "";
    return `payment ${STAGES[event.stage]}: ${amount} to ${short(event.payTo)} at ${event.host}${tx}${delivered}`;
}
