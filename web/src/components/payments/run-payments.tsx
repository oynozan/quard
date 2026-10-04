import { Coins } from "lucide-react";
import { DataTable, NameCell, Td, Th, Tr } from "@/components/kit/data-table";
import { StatusValue } from "@/components/kit/detail/detail-list";
import { WarningRule } from "@/components/kit/feedback/feedback";
import { SectionHeading } from "@/components/kit/headings";
import type { Payment } from "@/lib/data/payments/types";
import { formatClock } from "@/lib/format";
import { networkName } from "./lib/networks";
import { notDelivered, paymentState } from "./lib/words";
import { Payee, PaymentAmount, TxLink } from "./values";

const WIDTHS = ["24%", "15%", "15%", "13%", "17%", "16%"];

function PaymentRowView({ payment }: { payment: Payment }) {
    const { word, tone } = paymentState(payment);
    return (
        <Tr>
            <Td>
                <span title={payment.resource}>
                    <NameCell
                        icon={<Coins size={18} strokeWidth={0.75} />}
                        name={payment.host}
                        sub={`${payment.agent} · ${formatClock(payment.startedAt, true)}`}
                    />
                </span>
            </Td>
            <Td>
                <PaymentAmount usd={payment.usd} amount={payment.amount} />
            </Td>
            <Td className="text-[12px] text-ink-2">
                <Payee address={payment.payTo} />
            </Td>
            <Td className="truncate text-[12px] text-ink-2" title={payment.network}>
                {networkName(payment.network)}
            </Td>
            <Td className="text-[12px] text-ink-2">
                <span title={payment.reason ?? undefined}>
                    <StatusValue tone={tone}>{word}</StatusValue>
                </span>
            </Td>
            <Td className="text-[12px] text-ink-2">
                <TxLink network={payment.network} hash={payment.txHash} />
            </Td>
        </Tr>
    );
}

// The run's x402 payments, oldest first, with paid-but-not-delivered ones called out first
export function RunPayments({ payments }: { payments: Payment[] }) {
    if (payments.length === 0) return null;
    const undelivered = payments.filter(notDelivered).length;
    return (
        <section aria-label="Payments">
            <SectionHeading title="Payments" count={payments.length} />
            {undelivered > 0 ? (
                <WarningRule
                    className="mb-5"
                    title={
                        undelivered === 1
                            ? "1 payment paid, not delivered"
                            : `${undelivered} payments paid, not delivered`
                    }
                    note="The server settled, then answered with an error."
                />
            ) : null}
            <DataTable minWidth={880}>
                <colgroup>
                    {WIDTHS.map((width, index) => (
                        <col key={index} style={{ width }} />
                    ))}
                </colgroup>
                <thead>
                    <tr>
                        <Th>Payment</Th>
                        <Th>Amount</Th>
                        <Th>Payee</Th>
                        <Th>Network</Th>
                        <Th>Status</Th>
                        <Th>Transaction</Th>
                    </tr>
                </thead>
                <tbody>
                    {payments.map((payment) => (
                        <PaymentRowView key={payment.stepId} payment={payment} />
                    ))}
                </tbody>
            </DataTable>
        </section>
    );
}
