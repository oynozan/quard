import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { formatAge, formatInt, formatLongDate, formatShortDate } from "@/lib/format";
import { ValueCell } from "./value-cell";

type QuarantineTableProps = {
    rows: QuarantinedValue[];
    now: number;
    onMarkKnown: (row: QuarantinedValue) => void;
};

// Values the fleet check blocked everywhere, until someone marks them known
export function QuarantineTable({ rows, now, onMarkKnown }: QuarantineTableProps) {
    return (
        <DataTable minWidth={820}>
            <colgroup>
                <col style={{ width: "32%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
                <tr>
                    <Th>Value</Th>
                    <Th>Agents</Th>
                    <Th>Quarantined</Th>
                    <Th>Blocked</Th>
                    <Th>Last attempt</Th>
                    <Th>
                        <span className="sr-only">Actions</span>
                    </Th>
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
                        <Td>
                            <Hint content="Unblocks this value fleet-wide. Other guards still check it.">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onMarkKnown(row)}
                                    aria-label={`Mark ${row.value} as known`}
                                >
                                    Mark as known
                                </Button>
                            </Hint>
                        </Td>
                    </Tr>
                ))}
            </tbody>
        </DataTable>
    );
}
