import type { ReactNode } from "react";
import { DataTable, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Pane } from "@/components/kit/pane";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { TILE, TileGrid } from "@/components/fleet/tile-grid";
import type { NewPayeeRow, QuarantinedPayeeRow, SpendData } from "@/lib/data/payments/types";
import { formatCost, formatInt, formatLongDate, formatShortDate } from "@/lib/format";
import { networkName } from "../lib/networks";
import { Payee } from "../values";

const WIDTHS = ["30%", "18%", "18%", "14%", "20%"];

type PayeesTableProps = {
    headers: string[];
    rows: ReactNode[] | null;
    empty: string;
    loading: string;
};

// One tiled table, with skeleton rows while loading and a quiet line when empty
function PayeesTable({ headers, rows, empty, loading }: PayeesTableProps) {
    return (
        <>
            <DataTable minWidth={620} className="[&_td:first-child]:pl-3 [&_th:first-child]:pl-3">
                <colgroup>
                    {WIDTHS.map((width, index) => (
                        <col key={index} style={{ width }} />
                    ))}
                </colgroup>
                <thead>
                    <tr>
                        {headers.map((header) => (
                            <Th key={header} className="border-t-0">
                                {header}
                            </Th>
                        ))}
                    </tr>
                </thead>
                {rows ? <tbody>{rows}</tbody> : <SkeletonRows columns={headers.length} rows={4} label={loading} />}
            </DataTable>
            {rows?.length === 0 ? <QuietEmpty>{empty}</QuietEmpty> : null}
        </>
    );
}

function Day({ at }: { at: number }) {
    return (
        <time dateTime={new Date(at).toISOString()} title={formatLongDate(at)}>
            {formatShortDate(at)}
        </time>
    );
}

function Spent({ usd, unknown }: { usd: number; unknown: number }) {
    const title = unknown > 0 ? `Plus ${formatInt(unknown)} with no known USD value` : undefined;
    return <span title={title}>{formatCost(usd)}</span>;
}

const LAST = "last:[&_td]:border-b-0";

function newRow(payee: NewPayeeRow) {
    return (
        <Tr key={payee.payTo} className={LAST}>
            <Td className="text-ink">
                <Payee address={payee.payTo} />
            </Td>
            <Td className="truncate text-[12px] text-ink-2" title={payee.network}>
                {networkName(payee.network)}
            </Td>
            <Td className="text-[12px] text-ink-2">
                <Day at={payee.firstPaidAt} />
            </Td>
            <Td className="mono text-ink-2" title={payee.agents.join(", ")}>
                {formatInt(payee.runs)}
            </Td>
            <Td className="mono text-ink">
                <Spent usd={payee.usd} unknown={payee.unknown} />
            </Td>
        </Tr>
    );
}

function heldRow(payee: QuarantinedPayeeRow) {
    return (
        <Tr key={payee.address} className={LAST}>
            <Td className="text-ink">
                <Payee address={payee.address} />
            </Td>
            <Td className="text-[12px] text-ink-2">
                <Day at={payee.quarantinedAt} />
                {payee.observe ? <span className="ml-2 font-light text-ink-muted">observe only</span> : null}
            </Td>
            <Td className="mono text-ink-2">{formatInt(payee.runs)}</Td>
            <Td className="mono text-ink-2">{formatInt(payee.blockedAttempts)}</Td>
            <Td className="mono text-ink">{formatCost(payee.usd)}</Td>
        </Tr>
    );
}

// Payees first paid in the window, and wallets the fleet check holds
export function PayeesPanes({ spend }: { spend: SpendData | null }) {
    return (
        <section aria-label="Payees">
            <SectionHeading title="Payees" />
            <TileGrid className="grid-cols-1">
                <Pane title="New payees" className={TILE} bodyClassName="[&>[role=status]]:border-b-0">
                    <PayeesTable
                        headers={["Payee", "Network", "First paid", "Runs", "Spent"]}
                        rows={spend ? spend.newPayees.map(newRow) : null}
                        empty="No new payee in the last 30 days"
                        loading="Loading new payees…"
                    />
                </Pane>
                <Pane title="Quarantined payees" className={TILE} bodyClassName="[&>[role=status]]:border-b-0">
                    <PayeesTable
                        headers={["Payee", "Quarantined", "Runs", "Blocked", "Paid"]}
                        rows={spend ? spend.quarantined.map(heldRow) : null}
                        empty="No payee in quarantine"
                        loading="Loading quarantined payees…"
                    />
                </Pane>
            </TileGrid>
        </section>
    );
}
