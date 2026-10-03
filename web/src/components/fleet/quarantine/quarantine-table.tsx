import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { formatAge, formatInt, formatLongDate, formatShortDate } from "@/lib/format";
import { ValueCell } from "./value-cell";

// Values the fleet check blocked everywhere
export function QuarantineTable({ rows, now }: { rows: QuarantinedValue[]; now: number }) {
    return (
        <DataTable minWidth={720}>
            <colgroup>
                <col style={{ width: "38%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
                <tr>
                    <Th>Value</Th>
                    <Th>Agents</Th>
                    <Th>Quarantined</Th>
                    <Th>Blocked</Th>
                    <Th>Last attempt</Th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <Tr key={row.hash}>
                        <Td>
                            <ValueCell value={row} />
                        </Td>
                        <Td className="truncate text-[12px] text-ink-2" title={row.agents.join(", ")}>
                            {row.agents.join(", ")}
                        </Td>
                        <Td className="text-[12px] text-ink-2" title={formatLongDate(row.quarantinedAt)}>
                            {formatShortDate(row.quarantinedAt)}
                        </Td>
                        <Td className="mono text-[12px] text-ink">{formatInt(row.blockedAttempts)}</Td>
                        <Td className="text-[12px] text-ink-2" title={formatLongDate(row.lastAttemptAt)}>
                            {formatAge(row.lastAttemptAt, now)} ago
                        </Td>
                    </Tr>
                ))}
            </tbody>
        </DataTable>
    );
}
